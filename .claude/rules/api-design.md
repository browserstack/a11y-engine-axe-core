---
paths:
  - "ip-protection/**"
---

# API and Socket Design Rules

Backend server (`ip-protection`) is **Express + socket.io + Redis (ioredis) + S3 + BullMQ**.

## Layering

- **Routes** live in `ip-protection/routes/*.js` — bind path + middleware + controller. Routes do not contain business logic.
- **Controllers** in `ip-protection/controllers/*.js` — request handling, validation orchestration, dispatch to workers.
- **Workers** in `ip-protection/worker/*.js` (regular) and `ip-protection/aiWorker.js` (AI process).
- **Utilities** in `ip-protection/utils/*.js`.
- **Auth helpers** in `ip-protection/utils/middleware.js` only. Never re-implement JWT verification.

## Auth — pick one of the four middlewares for every new route

Defined in `ip-protection/utils/middleware.js`:

| Middleware | When to apply |
|---|---|
| `verifySocketAuthToken` | Applied at the `io.use(...)` level. All `socket.on(...)` handlers inherit auth. |
| `verifyAPIAuthToken` | User-scan HTTP routes. Bearer JWT. Sets `req.userId`, `req.groupId`, `req.apiVersion`, `req.applyConsolidation`. |
| `verifyAutomationAuth` | Automation-product routes (preprod only). Bearer static token vs `BASIC_AUTHTOKEN`. |
| `verifyBasicAuth` | Webhook endpoints (AI service callbacks). Note the current `\|\|` vs `&&` bug — `verifyToken` falls back across `JWT_TOKEN_SECRET` and `PREVIOUS_JWT_TOKEN_SECRET` for key rotation. |

**Hard rule**: No new HTTP route or socket event ships without one of these four.

## Socket protocol — additions

- Server is `ip-protection/app.js`. `maxHttpBufferSize: 3 MB`. Auth is at `io.use(verifySocketAuthToken)` (app.js line ~127).
- New `socket.on('...')` inside the existing connection handler inherits auth automatically. **Do not create a new `io` or `io.of(...)` namespace without re-applying auth.**
- Non-trivial handlers must live in `utils/*Handler.js`, never inline in `app.js`.
- Existing events (`scan_started`, `notifyRunStatus`, `scanIds`, `start`, `nodeDataChunk`, `b1DataChunk`, `sendB1Failure`, `nodeDataError`, `disconnect`) are the canonical reference — see `knowledge/docs/flows/socket-protocol.md`.

## HTTP route conventions

- All registered routes live in `routes/*.js`. New domain → new file. Don't dump cross-domain endpoints into the same file.
- Validate every request body with Joi (look at `controllers/buildProxyMap.js` for the canonical example).
- All exit points call `markTaskCompleted(...)` before `sendResponse(...)`. Prefer the `sendResponse(payload, jobData, type, task, isComplete)` signature over a manual `markTaskCompleted` call.
- New kill-switch–protected entry points should mark **every relevant `COMPLETION_TASK_TYPES.*` as already-done** when killed. See `buildProxyMap.js` for the six-task kill-switch pattern.

## Response path

`controllers/apiClient.js` exports two outbound helpers — use them, do not call `axios` directly for these targets:

| Helper | Target | Auth |
|---|---|---|
| `sendResponse(payload, jobData, type, task?, isComplete?, retries?)` | WebA11y backend `/api/a11y_engine_jobs` | `Basic BASIC_AUTHTOKEN` |
| `getAIResponse(payload, requestId, scanId, retries?, endpoint?)` | AI API | `Basic BASIC_AI_AUTHTOKEN` |

Retries: `MAX_API_RETRIES = 3`, exponential backoff, on status `502/503/504/429` plus network error codes (`NETWORK_EXCEPTIONS`).

## BullMQ enqueue discipline

- Use the typed helpers in `utils/bullmq.js` (`addJobToTypeB1Queue`, `addJobToScanCompleteQueue`, `addJobToPercyResultsQueue`, `addJobToProxyMapQueue`, `addJobToImageProcessingQueue`, `addJobToAiProcessingQueue`, `addJobToAiColorContrastQueue`, `addJobToPreProcessAIhtmlQueue`, `addJobToPostProcessAIhtmlQueue`, `addJobToCustomElementsAiQueue`, `addJobToConsolidationQueue`). **Never call `queue.add(...)` directly.**
- Job payload **passes IDs only**. Large data (DOM chunks, AI HTML) goes to Redis under a TTL-bound key; the job carries the key.
- `addJobToQueue` / `addAIJobToQueue` inspect `job.prioritized` and `productName` to route between normal and priority lanes (`onDemandScanQueue`, `aiOnDemandScanQueue`, etc.). Respect this contract.

## Worker registration

When adding a new queue:
1. Define it in `utils/bullmq.js`.
2. Bind a worker in the owning process file (`worker.js` for main, `aiWorker.js` for AI).
3. **Add the worker to the `workers` array passed to `setupWorkerShutdown(workers)` in `utils/workerShutdown.js`** — required for clean SIGTERM/SIGINT drain.
4. **Update the kill-switch script** (`scripts/killSwitchClearance.js` and any related ops scripts) to include the new queue. New queues without kill-switch coverage means runaway jobs cannot be drained operationally — flagged on PR #2240.
5. **Set `lockDuration` against the worker's actual p99 processing time, not the default.** A 2-minute lock on a worker that legitimately takes 3 minutes results in BullMQ marking the job stalled and re-enqueueing — the work runs twice (PR #2240). Measure on staging before merging.

## Concurrency math

When using `pLimit`, `Promise.all` on batched work, or any concurrency primitive, the documented limit must reflect the **actual peak**, not the per-iteration setting.

- `pLimit(10)` × 2 S3 PUTs per task = 20 peak concurrent ops, not 10 (PR #2149). Comments and config that say "10" mislead capacity planning.
- For Redis-heavy code paths, count the read+write fan-out per scan and **stress-test on a lower environment** before shipping. Reviewers have flagged "high Redis reliance for reads and writes for each run" repeatedly — measure CPU spike on staging.

## Null safety in shared helpers

The #1 source of production bugs is missing null checks in shared/common functions consumed by multiple rules or ATs (Jan 2026 ResponsivenessAT incident).

- Every function in `utils/`, `controllers/apiClient.js`, `commons/helper.js` that takes a caller-provided object must guard against `null` / `undefined` at the top of the function — not deep inside.
- When modifying a shared helper, **list every consumer** in the PR description. If the change is non-trivial, add unit tests covering each consumer's call shape.

## Silent failures forbidden

Never return an empty success result on failure. Returning `violations: []` after a decompression error makes downstream consolidation see a successful empty scan — the failure never surfaces (PR #2049).

- On decompression / parse / S3 / network failure inside a worker: log via `logger.log({kind: 'error', ...}).error(msg)`, mark the relevant `COMPLETION_TASK_TYPES.*` with the failure status (not as silent completion), and let consolidation know via the existing failure path. Do not return `[]` and exit.
- The same rule applies to webhook handlers — if AI response parsing fails, surface the error to EDS and trigger cleanup (`removeAIHtmlProcessDataAndEOF`); do not write an empty result to Redis.

## Latency instrumentation

Every new code path that's reachable from a scan must record latency. `apiTime.start()` at entry, `apiTime.end(label)` at exit — the existing pattern in `controllers/`.

- **Early-return paths must record latency in a `finally` block.** If a route bails before `apiTime.end` is called, the EDS event sends `NaN` for duration, which corrupts dashboards (PR #1989).
- Naming convention: the EDS label must match an existing metric family (`a11y_api_latency`, `scan_processing_time`) or add a new one with a tracked PR description.
