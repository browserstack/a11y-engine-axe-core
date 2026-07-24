# Socket Protocol

Socket.io server in `ip-protection/app.js`. All events authenticated via `io.use(verifySocketAuthToken)` (~app.js line 127) — the token decodes to `socket.data.userId` + `socket.data.groupId` before any `socket.on(...)` handler runs. See `auth.md`.

Max HTTP buffer size: **3 MB** (`maxHttpBufferSize: 3 * 1024 * 1024` in the `ioServer(httpServer, ...)` config). DOM chunks above this require chunking at the client.

## Server-side socket events (extension → ip-protection)

All handlers live in `ip-protection/app.js` unless noted.

| Event | Handler | Payload | Effect |
|---|---|---|---|
| `scan_started` | `scanStartedHandler` (`utils/scanStartedHandler.js`) | `{configuration, uuid}` — `runId` derived from `payload.configuration.metadata.productMetadata.scanRunId` or `payload.uuid` | Runs the handler, then sets Redis `scan_state:${runId} = STARTED` with `SCAN_STATE_TTL`, then flushes any queued statuses via `processPendingStatuses` |
| `notifyRunStatus` | `notifyRunStatusHandler` (`utils/notifyRunStatusHandler.js`) | `{uuid, status, ...}` | If scan not yet `STARTED`, queues with `queueIfScanNotStarted`; otherwise dispatches immediately |
| `scanIds` | `updateConnectionInfo` (`utils/socketsMap.js`) | `{...}` | Updates the socket↔scan mapping (`socketsMap`) consumed by `getConnectionInfo` for socket-driven flows (e.g. check/AT handlers in `checks/checkHandler*.js`). **Not** used by `sendResponse` — that path is HTTP, see "Outbound" below. |
| `start` | `checkHandler` (`checks/checkHandler.js`) | (check-specific) | Entry for check-level requests |
| `nodeDataChunk` | inline in app.js | `{uuid, chunk, size, batchNumber}` | Accumulates chunked binary DOM into `global.runCache[uuid].nodeData`; on last chunk, decodes to JSON |
| `b1DataChunk` | `b1DataChunkHandler` (`utils/b1DataChunkHandler.js`) | DOM chunk payload | Accumulates B1 DOM data; on EOF, calls `addJobToTypeB1Queue(job)` — this is the B1 dispatch trigger |
| `sendB1Failure` | `b1FailureHandler` (`utils/b1DataChunkHandler.js`) | `{error, ...}` | Calls `sendFailedResponse` for this scan |
| `nodeDataError` | inline in app.js | `{uuid, error}` | Stores error on `global.runCache[uuid].error` — later consumed by the B1 worker |
| `disconnect` | inline in app.js | `(reason, details)` | Calls `deleteConnectionInfo(socket.id)`; logs at ERROR if `reason === 'transport error'` and message matches `Max payload size exceeded` |

## Out-of-scope socket events (assisted tests)

`start-AT` → `assistedTestHandler`. Intentionally not covered in this architecture reference. See the source repo's `.claude/skills/add-assisted-test/` if you need the wizard protocol.

## Outbound to clients — not socket.io

The consolidated scan result is **not** emitted over socket.io. `sendResponse(...)` in `controllers/apiClient.js` does an `axios.post` to `https://<a11yHost>/api/a11y_engine_jobs` (the WebA11y backend) — `utils/socketsMap.js` is irrelevant to that path.

Real-time socket emits exist for **check-level / assisted-test flows** only. Those `socket.emit(...)` sites live in `checks/checkHandler*.js` and the AT handlers; consult those files directly for current event names since they can evolve.

## Adding a new socket event

From `rules/security.md` and `rules/api-design.md`: **no new socket event without auth.** Since `io.use(verifySocketAuthToken)` is applied at the `io` level, any new `socket.on('...')` inside the existing connection handler inherits auth automatically. That is the intended pattern — **do not create a new `io` or `io.of(...)` namespace without re-applying auth.**

Also:
- Put non-trivial handlers in `ip-protection/utils/*Handler.js`, not inline in `app.js`.
- Log at the `{kind: '...', action: '...', f0: userId, f1: scanId}` shape — see `observability.md`.
- Don't store incoming payloads anywhere without a TTL (see `storage.md`).

## See also

- `auth.md` — how `verifySocketAuthToken` works.
- `scan-lifecycle.md` — where each event fits in the bigger flow.
- `storage.md` — Redis keys written by socket handlers.
