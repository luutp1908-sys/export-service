# Export Service Outbox Pattern Plan

## Objective
Add an outbox pattern to the export-service so that job creation and queue publication are durable, inspectable, and recoverable when the queue is temporarily unavailable or partially fails.

## Why this is needed
The current create flow creates a database row first and then enqueues a BullMQ job. If the queue write fails after the DB write succeeds, the service can end up with a job record that never gets processed. This is the classic outbox-style consistency problem.

## Core design
Use a durable outbox table in the same database as the export job records.

Flow:
1. Create export job row in the database.
2. Insert a corresponding outbox event row in the same transaction.
3. A background dispatcher publishes the event to BullMQ.
4. Mark the outbox event as published once the queue write succeeds.
5. If publishing fails, retry the outbox event until it succeeds or is explicitly dead-lettered.

This ensures the queue action is recoverable even when the app crashes between the DB write and the queue publish.

---

## Progress tracker
- [x] Task 1: Define the outbox contract and status model
- [x] Task 2: Add Prisma schema for outbox table and indexes
- [x] Task 3: Add repository support for outbox write and polling
- [ ] Task 4: Add a dispatcher service to publish pending events
- [ ] Task 5: Update export job creation flow to create job + outbox in one transaction
- [ ] Task 6: Add idempotent queue publish logic with jobId correlation
- [ ] Task 7: Add retry and dead-letter handling for failed dispatches
- [ ] Task 8: Add structured logging and metrics for dispatch lifecycle
- [ ] Task 9: Validate end-to-end flow and recovery behavior

---

## Task 1: Define the outbox contract and status model
- [ ] Decide the outbox event payload fields: eventType, aggregateId, payload, createdAt, publishedAt, attempts, status
- [ ] Define status values: pending, publishing, published, failed, dead_lettered
- [ ] Confirm event ordering and idempotency requirements for export job creation
- [ ] Decide if the outbox will be generic or export-specific
- [ ] Capture the expected event contract for future queue consumers

## Task 2: Add Prisma schema for outbox table and indexes
- [ ] Add an `OutboxEvent` model in the Prisma schema
- [ ] Include a unique or stable identifier for each export job event
- [ ] Add indexes for status filtering and dispatch ordering
- [ ] Add migration generation for the new table
- [ ] Verify schema matches the export-service database setup

## Task 3: Add repository support for outbox write and polling
- [ ] Add repository methods for creating outbox event rows
- [ ] Add methods to fetch pending events ordered by created time
- [ ] Add method to mark an outbox event as published
- [ ] Add method to increment retry count and mark failure state
- [ ] Ensure repository operations are safe under concurrent dispatchers

## Task 4: Add a dispatcher service to publish pending events
- [ ] Create a dedicated outbox dispatcher service
- [ ] Poll for `pending` rows in batches
- [ ] Publish to BullMQ using the export job ID as the queue correlation key
- [ ] Handle partial failure without losing the event record
- [ ] Make the dispatcher idempotent and safe for restart

## Task 5: Update export job creation flow to create job + outbox in one transaction
- [ ] Update `createJob` to insert the export row and outbox row in the same transactional boundary
- [ ] Ensure the outbox event is created before returning success to the caller
- [ ] Preserve the request ID and job metadata in the outbox payload
- [ ] Guarantee that the created export ID is stable and reuse-safe for queue jobs
- [ ] Add validation to reject unsupported payload combinations before writing

## Task 6: Add idempotent queue publish logic with jobId correlation
- [ ] Reuse the export job ID as the queue job ID to avoid duplicates
- [ ] Ensure queue publish checks whether the job already exists before enqueueing
- [ ] Keep queue job metadata aligned with the outbox payload
- [ ] Document the relationship between export table row and BullMQ job
- [ ] Add safeguards against duplicate dispatches during retries

## Task 7: Add retry and dead-letter handling for failed dispatches
- [ ] Define retry limits and backoff strategy for dispatch failures
- [ ] Add a dead-letter policy for unrecoverable events
- [ ] Persist error text and failure timestamp for diagnosability
- [ ] Prevent infinite loops on permanent queue errors
- [ ] Add alerting hooks or logs for dead-letter conditions

## Task 8: Add structured logging and metrics for dispatch lifecycle
- [ ] Log when an outbox event is created
- [ ] Log when it is picked up for dispatch
- [ ] Log publish success, retry, and dead-lettered states
- [ ] Include export ID, event ID, and correlation context in the logs
- [ ] Add metrics for pending, published, failed, and dead-lettered outbox counts

## Task 9: Validate end-to-end flow and recovery behavior
- [ ] Test the happy path: create job -> outbox row created -> queue published -> worker processes
- [ ] Test queue failure: DB row persists and outbox remains pending until dispatch succeeds
- [ ] Test retry path: failed publish retries and eventually succeeds
- [ ] Test dead-letter path: unrecoverable event is marked as dead-lettered
- [ ] Test restart recovery: service restarts and pending outbox rows are dispatched

---

## Implementation notes
- Prefer a single database transaction for the export row + outbox row.
- Keep the dispatch loop separate from the request handler so the API request is not blocked by queue latency.
- Use an event type specific to export job creation, not a generic catch-all event container.
- Keep the queue job and export row keyed on the same export ID to simplify recovery and idempotency.
- Do not rely on the app process remaining alive for event delivery; the dispatcher must be restart-safe.

---

## Definition of done
The outbox pattern is complete when:
- export creation and event creation happen atomically,
- a failed queue publish does not leave a permanent orphaned job,
- pending outbox events are retried and recoverable after process restarts,
- the service can be audited by status and logs,
- and the export create flow remains reliable under transient queue failures.
