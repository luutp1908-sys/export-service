# Outbox Recovery Hardening Plan

## Objective
Harden the transactional outbox so it remains reliable across app restarts, transient queue outages, and concurrent dispatcher instances.

## Why this is needed
The current implementation covers the basic outbox flow, but it still has a few production risks:

- a row can remain stuck in `publishing` if the process crashes mid-dispatch
- multiple instances can race and pick the same outbox row simultaneously
- recovery logic currently only considers `pending` and `failed` rows, not stale `publishing` rows

This plan closes those gaps without changing the fundamental outbox design.

---

## Progress tracker

### Phase 1: Recovery from stale in-flight dispatches
- [x] Add a repository method to recover stale `publishing` rows back to `pending`
- [x] Include stale `publishing` rows in the dispatcher polling query
- [x] Invoke stale recovery on startup and before each dispatch cycle
- [x] Add metrics for stale recovery counts

### Phase 2: Prevent concurrent dispatcher races
- [ ] Replace single-dispatcher assumptions with PostgreSQL work claiming using `FOR UPDATE SKIP LOCKED`
- [ ] Claim a batch of unprocessed outbox rows per dispatcher instance without overlapping on the same row
- [ ] Make duplicate-dispatch protection explicit under multi-instance concurrency
- [ ] Add logs for claiming decisions and skipped claims

### Phase 3: Observability and operational safety
- [ ] Add explicit metrics: `stale_recovered`, `claim_skipped`, `claim_count`, `claim_conflict_count`
- [ ] Record claiming and retry decisions in dispatcher logs
- [ ] Add alerting guidance for dead-letter and stale-row thresholds

### Phase 4: Test coverage and validation
- [ ] Add a failing test for stale `publishing` recovery
- [ ] Add a failing test for duplicate dispatch under concurrent startup
- [ ] Add a happy-path integration test with DB + queue interaction
- [ ] Add a restart-recovery integration test

---

## Root cause summary
The outbox pattern is correctly implemented for a single successful dispatch cycle, but the recovery path is incomplete:

1. `markPublishing()` moves the row to `publishing` before the queue write.
2. A crash or hard kill between `markPublishing()` and `markPublished()` leaves the row ignored by the current polling query.
3. The current `findPending()` query does not include stale `publishing` rows.
4. Multiple app instances can both select the same pending row and race to enqueue it.

---

## Proposed changes

### 1) Recover stale `publishing` rows
Add a repository method with a cutoff such as `updatedAt < now - 2 * dispatch interval`.

Example behavior:
- if a row is `publishing` and has not changed for too long, reset it to `pending`
- allow the dispatcher to retry it

Implementation idea:
- add `recoverStalePublishing(maxAgeMs = 30000)` in `OutboxRepository`
- use `updatedAt` or a timestamp column to decide if the row is stale
- call this before `findPending()` in the trigger or dispatcher loop

### 2) Include stale `publishing` rows in the fetch query
Extend `findPending()` to query for:
- `status = pending`
- `status = failed` with attempts below max retry
- `status = publishing` and `updatedAt` older than the stale threshold

This ensures a process restart can safely drain orphaned dispatch attempts.

### 3) Use PostgreSQL work claiming via `FOR UPDATE SKIP LOCKED`
Use row-level locking in PostgreSQL so multiple dispatcher instances can safely claim different outbox events without colliding on the same row.

Recommended operation:
- select candidate outbox rows, ordered by creation time
- lock rows with `FOR UPDATE SKIP LOCKED`
- only the claiming instance can update the row to `publishing`
- other instances skip rows already claimed by another worker

This allows multiple replicas to process different work items in parallel while preventing the same row from being claimed twice.

### 4) Strengthen duplicate safety under concurrency
Keep the existing dedupe logic, but also treat the dispatcher as race-aware:
- keep `jobId = exportId`
- continue to check `getJob(exportId)` before enqueueing
- continue handling duplicate add exceptions as legitimate idempotent duplicates
- log the dedupe decision clearly

### 5) Add observability
Add counters and logs for:
- stale rows recovered
- dispatch cycles skipped due to lock contention
- duplicate jobs detected
- rows dead-lettered

This makes the recovery path observable and easier to debug in production.

---

## Suggested implementation order

1. Add stale `publishing` recovery repository method
2. Extend pending fetch logic to include stale `publishing` rows
3. Call recovery during startup and before each dispatch batch
4. Replace single-dispatcher assumptions with PostgreSQL `FOR UPDATE SKIP LOCKED` claiming
5. Add test coverage for stale recovery and claiming behavior
6. Add metrics and operation logs

---

## Acceptance criteria
The outbox pattern is considered hardened when all of the following are true:

- a process crash does not leave a row permanently stuck in `publishing`
- a restarted service can replay its pending and stale-publishing rows
- multiple dispatcher instances can claim different rows without overlapping on the same event
- duplicate queue jobs are rejected or treated as idempotent
- recovery behavior is observable through logs and metrics
- the dispatcher remains safe under transient Redis or DB failures

---

## Notes
This is a small but important improvement over the initial working version. The current code is acceptable for a single active instance, but production-grade recovery requires handling stale `publishing` state and dispatcher concurrency explicitly.
