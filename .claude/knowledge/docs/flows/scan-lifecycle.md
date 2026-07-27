# Scan Lifecycle

One full trace: **extension click → consolidated response pushed back to client**. Assisted Tests omitted.

## The ingress paths

All scans enter `ip-protection` through one of:

| Path                              | From                                           | Entry                                                 | Auth                                               |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Socket events                     | Extension / SDK (browser)                      | `io.on('connection')` in `ip-protection/app.js`       | `io.use(verifySocketAuthToken)` (~app.js line 127) |
| HTTP `/build-proxy-map`           | Extension after asset upload                   | `routes/scanRoutes.js → controllers/buildProxyMap.js` | `verifyAPIAuthToken`                               |
| HTTP `/accept_percy_result`       | Percy (after dom-forge runs non-AI Type C)     | `controllers/acceptResult.js`                         | `verifyAPIAuthToken`                               |
| HTTP `/accept_rules_data_percy`   | Percy (after dom-forge collects AI candidates) | `controllers/acceptRulesDataPercy.js`                 | `verifyAPIAuthToken`                               |
| HTTP AI webhooks (`/ai/webhook*`) | External AI service                            | `controllers/acceptAIResult.js`                       | `verifyBasicAuth`                                  |
| HTTP `/timeout`                   | weba11y (60-min timeout)                       | `controllers/timeout.js`                              | `verifyAPIAuthToken`                               |

## Full flow (B1 + Type C + AI, happy path)

```
┌──────────────────┐
│  Extension       │
│ (a11y-engine-    │
│  core / SDK)     │
└──────────────────┘
    │ 1. socket scan_started
    ▼
  Redis scan_state:${runId} = STARTED (TTL 60s)
    │
    │ 2. socket b1DataChunk (chunked gzipped DOM)  ─┐
    │    → b1DataChunkHandler accumulates in Redis  │  B1 path
    │    On EOF → addJobToTypeB1Queue               │
    │                                               │
    │                                               ▼
    │                                     typeB1Queue → workerB1.js
    │                                       → spawns combined-rules-worker-
    │                                         thread.js with version tag
    │                                       → may enqueue B2 via
    │                                         scanCompleteQueue
    │
    │ 3. Asset zip uploaded to S3 via presigned URLs (/fetch_presigned_urls)
    │    then:
    │    POST /build-proxy-map
    │       → addJobToProxyMapQueue
    ▼
  buildProxyMapQueue → worker/proxyMapWorker.js
    fetchAssetsZip from S3, unzip, upload each resource,
    build proxy map JSON, upload map, Redis resources:${scanId} (8h TTL)
    │
    │ If rules.length > 0:
    │   handleProxyMapCoordination (async, for Custom Elements AI)
    │   processProxyMapRequest (from controllers/getProxyMap.js)
    │     - createAIrunIdMapping → Redis ai_${runId} (2h TTL)
    │       (only if MEANINGFUL_ALT_TEXT_AI or
    │        COLOR_CONTRAST_AI or customElementsAI in rules)
    │     - POST ${percy.endpoint}/dom_forge
    │       Authorization: Token token=<percy.secret>
    │       payload: proxy_url, rules[], axe_script_url,
    │                dom_forge_core_script_url,
    │                backend_service_url: /accept_percy_result
    │
    │ Else: sendResponse(emptyTypeCPayload, 'C')
    │   (skips Percy; empty Type C response)
    ▼
┌──────────────────────────────────────────────────────┐
│ Percy (BrowserStack infra)                           │
│  - Loads axe.min.js + dom-forge-engine-core.min.js   │
│    from S3 URLs                                      │
│  - Routes asset requests via proxy map               │
│  - Runs dom-forge-core Type C rules                  │
│    (lib/core/runners/*)                              │
│                                                      │
│  Two outputs per rule:                               │
│    (a) non-AI → POST /accept_percy_result            │
│    (b) AI candidates → POST /accept_rules_data_percy │
│        (body.type = 'color-contrast-ai-v1' |         │
│         'customElement' | 'text-in-images' |         │
│         default altText)                             │
└──────────────────────────────────────────────────────┘
    │                                                │
    │ (non-AI Type C)                                │ (AI candidates)
    ▼                                                ▼
POST /accept_percy_result                  POST /accept_rules_data_percy
  acceptResult.js                            acceptRulesDataPercy.js
    addJobToPercyResultsQueue                  idempotency gate
                                                 (Redis acceptRules_${type}_${runId})
    percyResultsQueue                          dispatch by body.type:
      worker/workerC.js                          → preprocessAndIntegrateAiImageApi
        processTypeCJob                                (batch, stash per-image
        (sink only — does NOT run                       context in Redis,
         rules)                                         POST to AI API)
        fetchMetadataAndProxyUrl
        filters color-contrast-axe             AI API async response →
        sendResponse                             POST /ai/webhook
        COMPLETION_TASK_TYPES.TYPE_C             acceptAIResult.js
                                                   aiProcessingTypes dispatch:
                                                     altText → addJobToAi
                                                       ProcessingQueue
                                                     colorContrast → addJob
                                                       ToAiColorContrastQueue
                                                     (headings / customElement
                                                      have dedicated routes)
                                                 AI_TYPE_C_PROCESSING or
                                                 AI_COLOR_CONTRAST_PROCESSING
                                                 on aiTypeCProcessingQueue
                                                   worker/jobAIColorContrast.js
                                                   or workerAI.js (inline switch
                                                   in aiWorker.js)
    │                                                  │
    └───────────────────────────────┬──────────────────┘
                                    ▼
                         all lanes signal complete
                         → addJobToConsolidationQueue
                           consolidationQueue
                           worker/consolidationWorker.js
                             processConsolidationJob
                             merges B1 + B2 + non-AI C + AI lanes
                             → sendResponse(...)
                                 controllers/apiClient.js
                                 POST a11y host /api/a11y_engine_jobs
                                 Authorization: Basic BASIC_AUTHTOKEN
                                 (with retries on 502/503/504/429 +
                                  network errors)
```

## Routes registered in `ip-protection/routes/scanRoutes.js`

| Route                              | Controller                                         | Auth  | Purpose                                                                                                                      |
| ---------------------------------- | -------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /fetch_presigned_urls`       | `presignedUrlGenerator.js`                         | API   | Hands out signed S3 PUT URLs (optionally via CloudFront) for asset upload                                                    |
| `POST /scan-complete`              | `scanComplete.js`                                  | API   | Signals B1 done (→ B2 via `handleB2Processing → scanCompleteQueue`) OR C done (records null entry for completeness tracking) |
| `POST /build-proxy-map`            | `buildProxyMap.js`                                 | API   | Start the Type C pipeline after client uploaded asset zip                                                                    |
| `POST /accept_percy_result`        | `acceptResult.js`                                  | API   | Non-AI Type C result ingestion from Percy                                                                                    |
| `POST /get_proxy_map`              | `getProxyMap.js:getProxyMapController`             | API   | Same Percy trigger path but invoked externally (not from proxyMapWorker)                                                     |
| `POST /accept_rules_data_percy`    | `acceptRulesDataPercy.js`                          | API   | Percy-originated AI-candidate data (routes to `preprocessAndIntegrateAiImageApi` by `body.type`)                             |
| `POST /ai/webhook`                 | `acceptAIResult.js → acceptAIResult`               | Basic | Alt-text / color-contrast AI response                                                                                        |
| `POST /ai/webhook/heading`         | `acceptAIResult.js → acceptHeadingsAIResult`       | Basic | Heading AI response                                                                                                          |
| `POST /ai/webhook/custom-elements` | `acceptAIResult.js → acceptCustomElementsAIResult` | Basic | Custom-elements AI response                                                                                                  |
| `POST /timeout`                    | `timeout.js`                                       | API   | 60-min timeout hook from weba11y: cancel-scan via AI, force consolidation if source data exists, cleanup pending runIds      |

## Kill-switch path (in `buildProxyMap.js`)

When `isKillSwitchActive(userId, groupId, scanId)` returns killed, the controller **marks all six completion tasks as already-done** so run-tracking doesn't hang on dead pipelines:

```
COMPLETION_TASK_TYPES.TYPE_C
COMPLETION_TASK_TYPES.TEXT_IN_IMAGES
COMPLETION_TASK_TYPES.AI_STANDARD
COMPLETION_TASK_TYPES.AI_COLOR_CONTRAST
COMPLETION_TASK_TYPES.AI_HTML
COMPLETION_TASK_TYPES.AI_CUSTOM_ELEMENTS
```

Returns 200 immediately. No Percy call, no downstream work.

## Response path

`ip-protection/controllers/apiClient.js` exports:

- `sendResponse(payload, jobData, type, task?, isComplete?, retries?)` — terminal emitter. POSTs to `a11y_engine_jobs` on the weba11y host (`a11y[host_{region}]` or default). Calls `markTaskCompleted` first when `task` is supplied and `isComplete === true`.
- `getAIResponse(payload, requestId, scanId, retries?, endpoint?)` — outbound AI API call.

Both use `BASIC_AUTHTOKEN` (weba11y) and `BASIC_AI_AUTHTOKEN` (AI) from `config/constants.js`. Retries: `MAX_API_RETRIES = 3`, exponential backoff, on status `[502, 503, 504, 429]` + network error codes (`NETWORK_EXCEPTIONS`).

**Critical**: every new exit point **must** call `markTaskCompleted(...)` before `sendResponse(...)`. `sendResponse` enforces this via its `task` + `isComplete` parameters — prefer that shape over manual `markTaskCompleted` calls.

## Kill switches & caches

On server startup (`app.js`), three caches initialize in parallel:

- **Rules cache** — `initializeRulesCache()` (`utils/ruleFilter.js`). Which rules run per scan.
- **Kill-switch cache** — `refreshAllKillSwitchCaches()` (`utils/killswitch-utils.js`). Per-customer rule disablements.
- **Timeout cache** — `initializeTimeoutCache()` (`utils/timeout-cache.js`). Per-group B-type + Type C scan timeouts.

Any scan uses these at dispatch time.

## See also

- `socket-protocol.md` — all socket events in detail.
- `workers.md` — queues + worker dispatch.
- `dom-capture.md` — the full Type C pipeline, including proxy-map build.
- `rule-types.md` — which rule runs on which lane.
- `storage.md` — Redis keys + TTLs.
