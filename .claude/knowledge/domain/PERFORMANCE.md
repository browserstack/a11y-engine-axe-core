# Performance

a11y-engine runs against pages with **10,000+ DOM nodes** in real customer traffic. Performance discipline is non-negotiable in browser-context code.

## Browser context (`a11y-engine-core`, `dom-forge-core`)

### Hard prohibitions

| Anti-pattern | Why it matters |
|---|---|
| Full-tree DOM walks (`document.querySelectorAll('*')`, recursive root traversal) | Linear in node count — multiplies across all rules in a scan. On a 10k-node page, a single full walk costs ~3–10 ms; with N rules, the cost compounds. |
| Nested DOM loops | An O(N×M) DOM loop on a 10k-node page is 100M operations. |
| Repeated `querySelectorAll` inside loops | Each call re-walks subtree. Cache once outside the loop. |
| `getComputedStyle` on the same node twice | Computed style is expensive. Cache the `CSSStyleDeclaration`. |
| Allocations in hot loops | `Array.from(...)`, spread on iterables, throwaway closures inside per-element iteration all hit the GC. |
| Layout-thrashing APIs (`getBoundingClientRect`, `offsetWidth`, etc.) interleaved with mutations | Forces sync layout per call. Batch reads before any write. |

### Required patterns

- Walk up from a candidate node when you need ancestors — don't query for them globally.
- Cache `Map`/`Set` of already-computed results per scan to deduplicate work across rules.
- For style queries, accumulate the needed properties in one `getComputedStyle()` call.

### ESLint

`no-console` is configured as a **warning**, but treat it as an error in review. Use `EDSUtils.createEDSEvent(...)` for every browser-context emission.

## Server context (`ip-protection`)

### Hot paths

The hot paths to watch are:

| Path | Why hot |
|---|---|
| `b1DataChunkHandler` accumulating B1 DOM chunks | Called once per WebSocket message during a scan; one scan can produce hundreds of chunks. |
| `workerB1.js → processB1Job` | One thread per scan; combined-rules class chain walks B1 results. |
| `workerC.js → processTypeCJob` | Result-sink for Type C, called per Percy response (a scan can split into multiple). |
| `consolidationWorker.js → processConsolidationJob` | Merges all lanes — runs at the end of every scan. |
| `controllers/apiClient.js:sendResponse` | Outbound POST to WebA11y; one per terminal exit point. Retries on transient errors. |

### Hard prohibitions

- **No unbounded iteration.** Per project convention, "Never assume small collections — explicit upper bounds when iterating." This is enforced in review.
- **No raw DOM, AI HTML, or asset bytes in BullMQ job payloads.** Store in Redis (with TTL) or S3, hand the key to the job. Keeps Redis memory bounded per-scan and makes retries cheap.
- **No untimed Redis keys.** Every key has an explicit TTL via `EX`/`PX`/`EXPIRE` or a constant from `config/constants.js`.

### Worker lock durations

`utils/bullmq.js` defines:

| Constant | Value | Used by |
|---|---|---|
| `QUEUES_LOCK_DURATION` | 2 min | typeB1, percyResults, buildProxyMap (with 6 attempts + exp backoff), consolidation, priority jobs |
| `QUEUES_LOCK_DURATION_EXTENDED` | 5 min | imageProcessing (OCR can be slow) |
| `QUEUES_LOCK_DURATION_EXTENDED_15_MIN` | 15 min | scanComplete (B2 aggregation can take longer) |

If a worker exceeds its lock duration, BullMQ assumes failure and re-enqueues — leading to **double work** if the job actually completes. When raising lock durations, raise the workload's hard upper bound to match (e.g., add timeouts inside the worker).

### Retries

| Queue | Attempts | Backoff |
|---|---|---|
| `scanCompleteQueue` (B2) | 2 | Exponential |
| `buildProxyMapQueue` | 6 | Exponential |
| (default) | 1 | — |

`removeOnComplete` / `removeOnFail` default to `{ age: 3 days, count: CONFIG.bullmq.removeOnCompleteCount / removeOnFailCount }`.

### Redis

- **Read replica** — `REDIS_READ_REPLICA_OPTIONS` (alongside `REDIS_OPTIONS`) in `config/constants.js`. Use read replica for read-heavy paths (results fetching, status checks). Writes always go to the primary.
- **S3 Transfer Acceleration** — two clients in `utils/s3Utils.js`: `s3client` (standard) and `s3clientWithAcceleration` (for `preprod`/`production`/`dr` environments).

### Logging cost

- `logger.log({kind, action, f0, f1}).info(msg)` — 2-week retention, low cost. **Default choice.**
- `new EDSUtils(eventType, scanId).sendXxx(...)` — higher cost, BigQuery-bound. **Requires justification.**

Never log success paths or per-element processing on the server. Browser-side logs are sampled but server-side logs are not — they burn the 2-week retention budget.

## Latency budgets (observed via EDS)

The Type C worker emits these latency events in its `finally` block — they form the de facto budget for the Type C lane:

| Event | What it measures |
|---|---|
| `a11y_engine_scan` | Total Type C scan duration (worker_wait_time + worker_latency + downstream) |
| `percy_exec_latency` | Time Percy spent executing rules |
| `a11y_api_latency` | Time spent in `sendResponse` (outbound to WebA11y) |
| `worker_latency` | Time the Type C worker spent processing one response |
| `type_c_worker_wait_time` | Queue wait before the worker picked up the job |
| `type_c_worker_queue_size` | Snapshot of queue depth at pickup |

Plus from client `performanceData`:

| Event | What it measures |
|---|---|
| `domCaptureTime` | Client-side DOM serialization |
| `resourceCaptureTime` | Asset collection on the client |
| `totalTimeWithAssetUploading` | End-to-end including S3 PUTs |

When a perf regression is suspected, query these in BigQuery before changing code.
