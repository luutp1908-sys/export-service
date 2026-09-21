# Export Service Reliability Plan

## Objective
Improve the reliability and operational safety of the standalone export service so it behaves predictably in local development and production-like environments.

## Scope
- Service startup and port handling
- Environment configuration and secret loading
- Auth validation and identity trust boundaries
- Queue health and readiness checks
- Job creation, enqueue flow, and failure handling
- Observability and operational diagnostics

## Progress tracker
Use the checkboxes below to mark completion as work progresses.

---

## Task 1: Stabilize startup and port behavior
- [ ] Validate the app binds to the configured port without hanging or silently waiting
- [ ] Ensure startup logs clearly show the port chosen and any bind failure
- [ ] Add explicit error handling for port conflicts and listener failures
- [ ] Confirm local script behavior is deterministic and does not leave stale listeners behind
- [ ] Document the expected local startup command and required env values

## Task 2: Harden environment configuration loading
- [ ] Verify .env values are loaded consistently in local development
- [ ] Remove reliance on implicit or overwritten inline env assignments
- [ ] Document which variables are required for startup: PORT, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, DATABASE_URL, REDIS_HOST, REDIS_PORT, MOCK_MODE
- [ ] Confirm .env.example matches the actual runtime requirements
- [ ] Add validation for missing required env keys at startup

## Task 3: Fix auth trust boundaries for standalone operation
- [ ] Confirm the service validates JWT claims without depending on BE-only database tables
- [ ] Ensure a valid token is accepted while preserving identity checks for subject/email
- [ ] Remove any cross-service schema assumptions from the standalone auth flow
- [ ] Document the expected JWT contract between BE and export-service
- [ ] Validate both direct requests and proxied requests from BE

## Task 4: Improve queue readiness logic
- [ ] Define what “ready” means for queue initialization in local and production settings
- [ ] Make readiness tolerant of startup timing before worker heartbeat exists
- [ ] Avoid marking a healthy queue as unavailable just because no worker has produced a heartbeat yet
- [ ] Add clearer logging around queue connect, worker registration, and readiness checks
- [ ] Verify export job creation succeeds when Redis and queue are reachable

## Task 5: Strengthen export job lifecycle reliability
- [ ] Confirm DB write happens before queue enqueue in a transaction-safe pattern where possible
- [ ] Handle enqueue failures with clear status transitions and diagnostics
- [ ] Add recovery guidance for jobs stuck in a pending or retryable state
- [ ] Validate status progression from created -> queued -> processing -> completed/failed
- [ ] Add a visible error path for invalid export payloads

## Task 6: Add health and readiness endpoints
- [ ] Add /health/live for process liveness
- [ ] Add /health/ready for DB + Redis + queue readiness
- [ ] Include dependency status in readiness responses
- [ ] Make health responses safe for load balancers and platform checks
- [ ] Document expected behavior for deployment checks

## Task 7: Improve observability and debugging
- [ ] Add structured logs for job creation, enqueue, processing, and failure points
- [ ] Include request IDs and job IDs in log output
- [ ] Add correlation between BE proxy requests and downstream export-service jobs
- [ ] Capture queue and worker errors in a consistent format
- [ ] Document the troubleshooting flow for export failures

## Task 8: Validate the end-to-end flow
- [ ] Test direct export-service request path
- [ ] Test BE-to-export-service proxy path
- [ ] Verify JWT flow works with the same or expected secret configuration
- [ ] Verify a valid job is accepted and processed successfully
- [ ] Test failure scenarios for invalid config, invalid JWT, and Redis outages

## Task 9: Prepare for deployment and long-term maintenance
- [ ] Define required environment variables for non-local deployment
- [ ] Document secret management expectations for JWT and DB credentials
- [ ] Define restart and recovery behavior during temporary Redis or DB outages
- [ ] Review whether the service should be deployed independently or behind a shared gateway
- [ ] Capture operational runbook notes for on-call debugging

---

## Notes
- Local development should be easy to run and easy to diagnose.
- The service should not depend on BE-only database models or schema assumptions.
- Queue readiness must reflect actual runtime state, not startup timing artifacts.
- Job lifecycle and health monitoring should be treated as first-class reliability features.

## Definition of done
The reliability work is complete when:
- startup is predictable and logged clearly,
- auth works without BE schema coupling,
- queue readiness is accurate,
- export jobs complete or fail with clear diagnostics,
- health checks are available,
- and the end-to-end flow is validated from BE to the standalone export service.
