# Observability

The hard rules live in `rules/security.md` and `rules/frontend-components.md`. This file is the decision tree.

## Which logger do I use?

```
Where is this code running?
├── Browser (a11y-engine-core, dom-forge-core)
│   └── EDSUtils.createEDSEvent(config)     ← only option. No console.log.
│
└── Server (ip-protection)
    ├── Standard operational log, failure, unexpected state
    │   └── logger.log({kind, action, f0, f1}).info(msg)   ← 2-week retention, lower cost. Default.
    │
    └── Metric, latency, rule-level performance, DWH-bound event
        └── new EDSUtils(eventType, scanId).sendXxx(...)   ← higher cost. Justify.
```

## Entry points

| Context           | File                                                              | Example                                                                                                   |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Browser           | `a11y-engine-core/lib/core/utils/eds-utils.js` (class `EDSUtils`) | `EDSUtils.createEDSEvent({eventType, payload})`                                                           |
| Server — standard | `ip-protection/utils/logger.js` (winston + chitragupta wrapper)   | `logger.log({kind: 'WORKER_TYPE_B1_SCAN_TIMEOUT', action: 'ERROR', f0: userId, f1: scanId}).error('...')` |
| Server — metrics  | `ip-protection/utils/eds-utils.js` (class `EDSUtils`)             | `new EDSUtils(debugEventTypes.B1_WORKER, scanId).sendATRuleLatency(rule, ms)`                             |

## Log-kind namespace

`ip-protection/config/enum.js` exports `LOG_KIND` — a nested namespace (`LOG_KIND.AUTH.ERROR`, `LOG_KIND.WORKER.ERROR`, etc.). Prefer these over inline strings so `kind` stays searchable in log queries. `SHORTENED_KEY` (utils/constants) is the shorthand map for payload keys.

## Log correlation (Chitragupta)

`verifyAPIAuthToken` registers `Chitragupta.setMetaData('userId', ...)` on every authenticated request. Subsequent `logger.log(...)` calls within that request scope inherit `userId` automatically.

For socket flows, you must set it manually inside the handler if you want correlation. Pattern: `Chitragupta.setMetaData('userId', socket.data.userId)` at the top of the handler.

## What not to log

- **No `console.log` anywhere** (browser or server).
- Do not log success paths — they burn the 2-week retention budget on server, and are sampled+expensive on browser.
- Do not log per-element processing in browser-context code — Type B1 evaluators run against thousands of nodes per scan.
- Do not log raw tokens, auth headers, or user PII.

## EDS payload schema strictness

EDS events are silently rejected when the payload doesn't match the expected schema. The receiver is strict; there is no error response surfaced to the sender (PR #1971).

- **`eventType` is case-sensitive.** `'scanStart'` and `'scan_start'` are different events; the wrong case results in dropped events with no signal. Use the constants in `a11y-engine-core/lib/core/base/eds-event-types.js` and `ip-protection/config/enum.js` — never hand-write the string.
- **`api_key` must be top-level**, not nested inside `payload`. The wrapper sets this automatically; do not override the structure.
- Required envelope: `{eventType, api_key, payload, timestamp}`. Missing any of these → silently dropped.

## EDS latency events (Type C lane)

`workerC.js` emits in its `finally` block:

- `a11y_engine_scan`
- `percy_exec_latency`
- `a11y_api_latency`
- `worker_latency`
- `type_c_worker_wait_time`
- `type_c_worker_queue_size`

Plus from client `performanceData`:

- `domCaptureTime`
- `resourceCaptureTime`
- `totalTimeWithAssetUploading`

These are the canonical Type C latency budget — when a perf regression is suspected, query these in BigQuery before changing code.

## See also

- `rules/security.md` — enforcement.
- `agents/stack:feature-builder.md` — observability persona rules.
- `knowledge/PERFORMANCE.md` — perf budgets and logging cost.
