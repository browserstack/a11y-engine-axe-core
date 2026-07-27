# DOM Capture + Type C Pipeline

`dom-forge-core` is not just a DOM capture layer — it's the **rule-execution runtime** for Type C rules, driven by Percy on BrowserStack infrastructure. `a11y-engine-core` handles client-side capture, `ip-protection` orchestrates proxy-map construction + Percy invocation, and then `dom-forge-core` runs on Percy with controlled JS/asset resolution.

## End-to-end Type C pipeline

```
┌──────────────────────────────────────────────────┐
│  a11y-engine-core  (browser: extension / SDK)    │
│    - Captures DOM                                │
│    - Collects referenced assets into a zip       │
│    - Uploads zip to S3 (via presigned URLs:      │
│        POST /fetch_presigned_urls)               │
└──────────────────────────────────────────────────┘
            │
            │  POST /build-proxy-map
            │   { runId, scanId, zipId, clientPageMeta,
            │     metadata, rules[], timestamp,
            │     performanceData, ruleData,
            │     customRuleConfig? }
            ▼
┌──────────────────────────────────────────────────┐
│  controllers/buildProxyMap.js                    │
│    - Joi-validate                                │
│    - Kill-switch gate (killswitch-utils)         │
│        → if killed: markTaskCompleted for        │
│          [TYPE_C, TEXT_IN_IMAGES, AI_STANDARD,   │
│           AI_COLOR_CONTRAST, AI_HTML,            │
│           AI_CUSTOM_ELEMENTS] and return 200     │
│    - addScanEntry (Redis)                        │
│    - uptimeMetricsEmitter.emit('request:received')│
│    - addJobToProxyMapQueue(job)                  │
└──────────────────────────────────────────────────┘
            │
            │  buildProxyMapQueue
            │    (6 attempts, exponential backoff)
            ▼
┌──────────────────────────────────────────────────┐
│  worker/proxyMapWorker.js → buildProxyMap        │
│    - Timeout guard (isScanTimedOut)              │
│    - generateProxyMap:                           │
│        fetchAssetsZip(scanId, testCaseId,        │
│                       zipId, userId, runId)      │
│        for each resource in zip metadata.json:   │
│          if existing → reuse existing S3 URL     │
│          else → uploadAssetFile to S3 (per-region)│
│        build proxy map { origURL: {url, mime} }  │
│        hset `resources:${scanId}` (TTL 8h)       │
│        uploadAssetFile(proxyMap JSON) → proxyMapUrl│
│                                                  │
│    - If rules.length > 0:                        │
│        handleProxyMapCoordination (async,        │
│          for Custom Elements AI)                 │
│        processProxyMapRequest(isFromWorker=true) │
│                                                  │
│    - Else (no advanced rules):                   │
│        sendResponse(emptyTypeCPayload, 'C')      │
│        (skips Percy entirely)                    │
└──────────────────────────────────────────────────┘
            │
            │  (advanced rules path)
            ▼
┌──────────────────────────────────────────────────┐
│  controllers/getProxyMap.js → processProxyMap    │
│  Request                                         │
│    - Blacklist check                             │
│    - WORKFLOW_ANALYSER prioritization (first N)  │
│    - Load kill-switch feature flags              │
│    - Build apiData (backend URLs, proxy URL, ...)│
│    - formatData → Percy payload:                 │
│        { browser, viewport, proxy_url, rules[],  │
│          authenticity_token,                     │
│          backend_service_url: .../accept_percy_  │
│          result,                                 │
│          axe_script_url, dom_forge_core_script_  │
│          url (both S3 URLs),                     │
│          metadata, rule_data }                   │
│    - If rules include MEANINGFUL_ALT_TEXT_AI     │
│      or COLOR_CONTRAST_AI_PSEUDO_LITERAL         │
│      or isCustomElementAISession:                │
│        createAIrunIdMapping → Redis `ai_${runId}`│
│        (this is where the AI state key is born)  │
│    - If applyConsolidation: setConsolidationFlag │
│    - POST ${CONFIG.percy.endpoint}/dom_forge     │
│        Authorization: Token token=<percy.secret> │
│        3 retries, exponential backoff            │
└──────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────┐
│  Percy (BrowserStack infrastructure)             │
│    - Loads axe_script_url + dom_forge_core_      │
│      script_url from S3                          │
│    - Renders the page USING the proxy map —      │
│      every asset request routes to S3 via the    │
│      map. Percy is NOT auto-discovering;         │
│      resources arrive only through the map we    │
│      built.                                      │
│    - Executes dom-forge-core Type C runners      │
│      (lib/core/runners/*):                       │
│        color-contrast, focus-visible,            │
│        non-text-control-contrast,                │
│        reflow-4x-zoom-scroll, resize-2x-zoom,    │
│        text-in-images,                           │
│        custom-elements-snapshot-capture,         │
│        meaningfulAltText/                        │
│                                                  │
│    TWO output endpoints (split per rule):        │
│      (a) non-AI results → POST backend_service_  │
│          url (/accept_percy_result)              │
│      (b) AI candidate data → POST /accept_rules_ │
│          data_percy with body.type set:          │
│            'color-contrast-ai-v1'                │
│            'customElement'                       │
│            'text-in-images'                      │
│            (default) → altText                   │
└──────────────────────────────────────────────────┘
       │                                 │
       │ non-AI                          │ AI candidates
       ▼                                 ▼
POST /accept_percy_result         POST /accept_rules_data_percy
  → acceptResult.js                 → acceptRulesDataPercy.js
  → addJobToPercyResultsQueue       → idempotency gate
  → percyResultsQueue                  (`acceptRules_${type}_${runId}`)
  → worker/workerC.js               → dispatch by body.type →
    processTypeCJob                    preprocessAndIntegrateAiImageApi
    (result ingestion, filters         (batch, stash Redis, call AI API,
     color-contrast-axe incomplete,     webhook returns to /ai/webhook*)
     emits DOM-forge latencies
     to EDS, sendResponse)
```

## Non-AI vs AI output endpoints — distinction

| Aspect      | `/accept_percy_result`                                                 | `/accept_rules_data_percy`                                                   |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Controller  | `acceptResult.js`                                                      | `acceptRulesDataPercy.js`                                                    |
| Carries     | Already-evaluated Type C rule results (violations, passes, incomplete) | Candidate data needing AI adjudication                                       |
| Auth        | `verifyAPIAuthToken`                                                   | `verifyAPIAuthToken`                                                         |
| Idempotency | Via queue semantics                                                    | Redis `acceptRules_${type}_${runId}` (optionally per-batch for apiVersion 2) |
| Downstream  | `percyResultsQueue → workerC.js` (sink, not runner)                    | Calls AI API → async webhook `/ai/webhook*` → appropriate AI queue           |

## What `workerC.js` actually does

`workerC.js → processTypeCJob` **does not run rules**. Rules ran on Percy in `dom-forge-core`. The worker:

1. Hydrates `proxyUrl`, timestamps, `pendingResponseCount` from Redis `scanEntry`.
2. Gets `resultTypes` (violations/incomplete/passes) filter per scan.
3. Filters `color-contrast-axe` from incomplete (the axe-level incomplete is reported separately from the AI path — they'd double-count).
4. Builds response payload and `sendResponse(..., 'C', COMPLETION_TASK_TYPES.TYPE_C, isLastResponse)`.
5. In the `finally` block, emits DOM-forge latencies to EDS: `a11y_engine_scan`, `percy_exec_latency`, `a11y_api_latency`, `worker_latency`, `type_c_worker_wait_time`, `type_c_worker_queue_size`, plus `domCaptureTime / resourceCaptureTime / totalTimeWithAssetUploading` from client `performanceData`.

Ordering note: Percy can split one scan into multiple Type C response posts (`response.data.jobIds.length`). `processProxyMapRequest` stores `pendingResponseCount`; `processTypeCJob` counts down and marks the task complete only on the last response.

## Automation product (preprod only)

Separate route pair lives under `controllers/automation/`:

- `POST /automation/push-proxy-map-to-percy` → `pushProxyMapToPercy.js` — Percy call with a different script bundle (`rule-automation-type-c/developer-scripts/${branchName}/...`); stores `scanId` in Redis (`TYPE_C_AUTOMATION_TTL = 2 d`).
- `POST /automation/accept_percy_rules_result` → `acceptPercyRulesResult.js` — result ingestion for automation flow.

Preprod-only: both fail with 400 in other environments.

## Performance constraints

From `rules/frontend-components.md`:

- No full-tree DOM walks.
- No nested DOM loops.
- No repeated `querySelectorAll`.
- No allocations in hot loops.
- No `console.log` — use `EDSUtils.createEDSEvent(config)`.

These apply to browser-context code in both `a11y-engine-core` and `dom-forge-core`.

## See also

- `overview.md` — the 3 packages.
- `scan-lifecycle.md` — full multi-lane flow.
- `workers.md` — buildProxyMapQueue, percyResultsQueue, AI queues.
- `storage.md` — `resources:${scanId}` (8 h), `ai_${runId}` (2 h), S3 asset paths.
- `rule-types.md` — where each Type C rule lives.
- `rules/frontend-components.md` — performance rules.
