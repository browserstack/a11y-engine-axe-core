# AI Service — a11y-engine Integration

The AI Service (misc-services/context_generator) provides LLM-powered accessibility analysis. a11y-engine calls it for detection (alt-text, color-contrast, heading, custom-elements, cookie-banner/overlay) and receives results via webhook callbacks.

## Connection

- **Outbound**: `http://${CONFIG.ai.host}/web-ally/${endpoint}` via `controllers/apiClient.js:getAIResponse`
- **Auth**: `Authorization: Basic <BASIC_AI_AUTHTOKEN>` (`${CONFIG.ai.username}:${CONFIG.ai.password}` base64-encoded)
- **Config**: `ip-protection/config/keys.yml` (`ai.username`, `ai.password`), `config/config.yml` (`ai.host`)
- **Retries**: 3 retries on 502/503/504/429 + network errors. After exhaustion, failure-path cleanup runs (`removeAIHtmlProcessDataAndEOF`)
- **Failure behavior**: When the AI Service is unreachable or all retries are exhausted, the scan does **not** block. AI rules are skipped for that scan — cleanup removes pending AI state and triggers EOF so consolidation can complete with non-AI results only. Webhook timeout (no callback received) is handled by BullMQ job TTL; stale jobs are eventually cleaned up and the scan completes without AI results.

## Outbound Endpoints (a11y-engine → AI Service)

| AI sub-pipeline         | Endpoint constant                            | Path                                           | Triggered by                                                                                                                    |
| ----------------------- | -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Alt-text / image        | `AI_API_ENDPOINTS.ALT_TEXT`                  | `/web-ally/suggest-alt-text`                   | `workerAI.js` after receiving candidates from `/accept_rules_data_percy`                                                        |
| Color contrast          | `AI_API_ENDPOINTS.COLOR_CONTRAST_V1`         | `/web-ally/analyse-text-contrast`              | `jobAIColorContrast.js` after receiving candidates from `/accept_rules_data_percy`                                              |
| Heading issues          | `AI_API_ENDPOINTS.HEADING_RULE_AI`           | `/web-ally/analyze-heading-issues`             | `workerPreProcessAIhtml.js` after B1 handler enqueues with `enableHeadingAIRule`                                                |
| Custom elements         | `AI_API_ENDPOINTS.CUSTOM_ELEMENTS_AI`        | `/web-ally/analyze-custom-element-interaction` | `workerCustomElementsAI.js` after receiving candidates from `/accept_rules_data_percy`                                          |
| Cookie banner / overlay | — (hardcoded in dom-forge-core, no constant) | `${apiData.aiHost}/web-ally/analyze-overlay`   | `dom-forge-core/lib/core/runners/cookie-banner-detection-snapshot.js` on Percy (BrowserStack's cloud browser rendering service) |

The first 4 pipelines go through `getAIResponse()` in `controllers/apiClient.js` (ip-protection). Cookie banner detection is different — it calls the AI Service **directly from dom-forge-core running on Percy** (browser context), bypassing ip-protection entirely.

## Inbound Webhooks (AI Service → a11y-engine)

| Webhook route                      | Auth              | Handler                        | Queue dispatched                                      |
| ---------------------------------- | ----------------- | ------------------------------ | ----------------------------------------------------- |
| `POST /ai/webhook`                 | `verifyBasicAuth` | `acceptAIResult`               | `aiTypeCProcessingQueue` (alt-text result processing) |
| `POST /ai/webhook/heading`         | `verifyBasicAuth` | `acceptHeadingsAIResult`       | `postProcessAIhtmlQueue` (DOM reconstruction)         |
| `POST /ai/webhook/custom-elements` | `verifyBasicAuth` | `acceptCustomElementsAIResult` | `customElementsAiQueue`                               |

Webhook auth uses rotating tokens: `BASIC_WEBHOOK_AUTHTOKEN_0` / `BASIC_WEBHOOK_AUTHTOKEN_1`. Note: there is a known bug where the condition uses `||` instead of `&&` in `utils/middleware.js:verifyBasicAuth`, effectively rejecting valid tokens unless both env vars hold the same value.

### Webhook payload schemas (validated via Joi in `controllers/acceptAIResult.js`)

Both alt-text and color-contrast results arrive at `POST /ai/webhook`. The `acceptAIResult` handler disambiguates by checking for the presence of `requestId` (color-contrast schema) vs `request_id` (alt-text schema) in the payload.

- **Alt-text (default)**: `{source, user_id, group_id, data: {result: [{id, status, result}]}, request_id}`
- **Color-contrast**: `{requestId, status, data: {result: [{id, analysisStatus, result}]}}`
- **Headings**: `{source, ...}` — stashes full response in Redis, enqueues minimal postprocess job
- **Custom-elements**: Similar to default schema with custom-element-specific fields

## AI Rule Flows — End to End

Each AI sub-pipeline produces specific rule results. Understanding these flows is essential when adding or modifying AI rules.

### Image AI (Alt-text) → 4 rules

1. WebA11y BE passes AI config flags → a11y-engine-core adds `meaningful-alt-text-ai` to Type C rules
2. dom-forge-core's `meaningfulAltText/` runner captures images on Percy, POSTs to `/accept_rules_data_percy` (type: `altText`)
3. ip-protection enqueues to `aiTypeCProcessingQueue`
4. `workerAI.js` batches images, calls AI Service at `/web-ally/suggest-alt-text`
5. AI webhook returns to `/ai/webhook` with per-image classification (`Simple`, `Complex`, `Screenshot`, `Decorative`) and suggested alt text
6. `workerAI.js:processAITypeCJob` evaluates each image and produces results for:
   - `meaningful-alt-text-ai` — Simple images: checks if existing alt text is meaningful
   - `decorative-image` — Decorative images: checks if marked decorative
   - `missing-long-alt` — Complex/Screenshot images: checks for long description
   - `image-alt-ai` — Non-decorative images: checks alt text quality against AI suggestion

### Color Contrast AI → 1 rule

1. WebA11y BE passes color-contrast AI flag → dom-forge-core's `color-contrast.js` runner detects `color-contrast-ai` is enabled
2. Runner hands off candidates to `/accept_rules_data_percy` (type: `color-contrast-ai-v1`)
3. ip-protection enqueues to `aiTypeCProcessingQueue` (shared with alt-text)
4. `jobAIColorContrast.js:processAIColorContrastJob` calls AI Service at `/web-ally/analyse-text-contrast`
5. AI webhook returns to `/ai/webhook`
6. Produces results for: `color-contrast`

### Heading AI → 2 rules

1. WebA11y BE passes heading AI flag → `enableHeadingAIRule(config, metadata)` returns true
2. B1 check handler (`checkHandler-v2.js`) enqueues `PRE_PROCESS_AI_HTML` after B1 dispatch (B1 = server-side rule lane that runs in ip-protection workers; see `flows/rule-types.md` for full lane taxonomy)
3. `workerPreProcessAIhtml.js` decompresses B1 DOM, stamps `ally-id` on visible elements, uploads HTML + context to S3, calls AI Service at `/web-ally/analyze-heading-issues`
4. AI webhook returns to `/ai/webhook/heading`
5. `acceptHeadingsAIResult` stashes response in Redis, enqueues `POST_PROCESS_AI_HTML`
6. `workerPostProcessAIhtml.js` downloads data from S3, reconstructs DOM, maps `elementId → selector`
7. Produces results for: `missing-heading-ai`, `incorrect-heading-ai`

### Custom Elements AI → 3 rules

Custom elements AI runs in a **separate, independent Percy call** triggered after B1 result evaluation — it does not share the main Type C Percy call.

1. WebA11y BE passes `customElementsAI` flag in `a11yCoreConfig`
2. After B1 rules complete in `workerB1.js`, `processCustomElementsAI()` (from `utils/custom-elements-ai-utils.js`) evaluates B1 violations to find custom element candidates
3. If candidates exist, it triggers a **new Percy call** via `processProxyMapRequest` with `customElementsAI` parameter — this is a separate Percy render from the main Type C call
4. On Percy, `custom-elements-snapshot-capture.js` captures custom element DOM snapshots
5. Percy POSTs results to `/accept_rules_data_percy` (type: `customElement`)
6. ip-protection enqueues to `customElementsAiQueue`
7. `workerCustomElementsAI.js` batches elements, calls AI Service at `/web-ally/analyze-custom-element-interaction`
8. AI webhook returns to `/ai/webhook/custom-elements`
9. Produces results for: `role-required`, `accessible-name`, `keyboard-interactive`

### Cookie Banner / Overlay Detection

See dedicated section below — unique flow that bypasses ip-protection entirely.

## Cookie Banner / Overlay Detection (5th AI sub-pipeline)

Unlike the other 4 AI pipelines, this one does **not** flow through ip-protection workers. It runs entirely in dom-forge-core on Percy and calls back to the accessibility repo (not a11y-engine).

**Flow:**

1. `dom-forge-core/lib/core/runners/cookie-banner-detection-snapshot.js` runs on Percy (BrowserStack's cloud browser rendering service used for Type C rule execution) during a Type C scan
2. Gated by `apiData.isCookieBannerDetectionEnabled`
3. Captures a viewport screenshot (1280×1024, 2x scale), uploads to S3 via presigned URL
4. POSTs directly to AI Service at `${apiData.aiHost}/web-ally/analyze-overlay` with `{userId, groupId, scanId, viewportImageUrl, url, runId, a11yProduct}`
5. Auth: `Basic ${apiData.aiAuthToken}` (same AI credentials — ip-protection injects `aiHost`, `aiAuthToken` into `apiData` before invoking Percy, so dom-forge-core receives them as part of the scan config without needing direct access to `keys.yml`)
6. Retries: 2 retries on failure
7. AI Service analyzes the screenshot for cookie banners, then calls back to the **accessibility** repo at `POST /api/internal/v1/overlay-detection` — **not** back to a11y-engine

**Key difference from other AI pipelines:** No BullMQ queue, no ip-protection worker, no webhook back to a11y-engine. The dom-forge-core runner handles the full outbound call and the result lands in the accessibility repo directly.

**Key file:** `dom-forge-core/lib/core/runners/cookie-banner-detection-snapshot.js`

## AI Config Flags (from WebA11y BE)

WebA11y BE sends `a11yCoreConfig` as part of the scan configuration. These flags control which AI pipelines activate in a11y-engine. The flags arrive via socket on scan start and are stored in Redis by `scanStartedHandler.js`.

| Flag in `a11yCoreConfig`                               | What it enables                                                                                | Gate function                                                                                                                                                                                         | Min engine version                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `altTextAI: true` (new) / `ai: true` (legacy fallback) | Alt-text AI (image classification + meaningful alt text)                                       | `isAltTextAIEnabled()` in `a11y-engine-core/lib/core/utils/helpers.js` — checks `altTextAI` first, falls back to `ai` if undefined (backward compat for scans started before Rails emits `altTextAI`) | —                                       |
| `colorContrastAI: true`                                | Color contrast AI                                                                              | checked in `typeCRunner.js` directly                                                                                                                                                                  | —                                       |
| `headingRulesAI: true`                                 | Heading AI (preprocess + postprocess)                                                          | `enableHeadingAIRule(config, metadata)` in `commons/helper.js`                                                                                                                                        | `>= 5.12.0`                             |
| `customElementsAI: true`                               | Custom elements AI                                                                             | `isCustomElementsAIEnabled(config, metadata)` in `commons/helper.js`                                                                                                                                  | `>= MIN_CUSTOM_ELEMENTS_ENGINE_VERSION` |
| `enableAdvancedRules: true`                            | Master gate — all AI pipelines require this to be true (along with `experimental` tag enabled) | checked in `determineExpectedTasks`                                                                                                                                                                   | —                                       |

**How flags propagate:**

1. WebA11y BE sets flags in `a11yCoreConfig` based on user's plan, opt-in status, and feature fencing (see accessibility stack's `ai-service.md`)
2. On scan start, `scanStartedHandler.js` stores `ai_enabled` in Redis via `storeAIConfigAndUserGroup`
3. `determineExpectedTasks()` in `utils/redis-utils.js` reads these flags to register expected completion tasks (`AI`, `AICC`, `AIH`, `AICE`)
4. `typeCRunner.js` in a11y-engine-core reads flags to decide which rules to include in the Type C rule list sent to dom-forge-core

## How dom-forge-core Receives AI Flags

dom-forge-core runs in Percy (browser context) and doesn't read Redis or config files. It receives AI configuration through the rule list and `apiData`:

- **Rule list gating**: `typeCRunner.js` adds or removes AI rules from the Type C rule list based on flags. dom-forge-core runners check `configuration.runOnly.values` to see if their rule ID is present (e.g., `meaningful-alt-text-ai`, `color-contrast-ai`, `cookie-banner-detection-snapshot`)
- **`apiData` injection**: ip-protection's `processProxyMapRequest` in `getProxyMap.js` builds the `apiData` object with AI-specific fields (`aiHost`, `aiAuthToken`, `isCookieBannerDetectionEnabled`, `customElementsData`). This is passed to Percy, which forwards it to dom-forge-core runners
- **Cookie banner gating**: Uses both the rule list check AND `apiData.isCookieBannerDetectionEnabled` (resolved from Redis by `isCookieBannerDetectionEnabledRedis`)

## AI State Keys (Redis)

Two mutually exclusive keys per `runId` determine which AI pipeline is active for a scan:

- `ai_${runId}` — set by `createAIrunIdMapping` in `controllers/getProxyMap.js` before Percy is invoked. Used for Type C-originated AI (alt-text, color-contrast, custom-elements)
- `aihtml_${runId}` — set by `setAIHtmlMetadataIfAIKeyEmpty` via Lua script in `utils/redis-utils.js`. Used for Heading AI (B1-originated). Only set if `ai_${runId}` is empty

Both have TTL of 2 hours. Webhook controllers read whichever key is present to hydrate `scanId`/`userId`.

**Coexistence:** A single scan can use both Type C AI rules (e.g., alt-text) and Heading AI, but they use separate `runId` values — Type C runs get their own Percy `runId` with `ai_${runId}`, while Heading AI uses the B1 `runId` with `aihtml_${runId}`. The mutual exclusion is per-runId, not per-scan.

## Adding a New AI Rule (a11y-engine side)

1. Create rule JSON in `ip-protection/rules/` with `"counterpart"` pointing to the non-AI rule name
2. Add the rule to `RULES_WITH_AI_COUNTERPARTS` in `a11y-engine-core/lib/core/base/constants.js`
3. Choose pipeline: if Type C-originated (runs on Percy), wire candidate collection in a dom-forge-core runner and POST to `/accept_rules_data_percy`. If B1-originated (like heading), wire in `checks/checkHandler-v2.js`
4. Create or reuse a BullMQ queue + worker. Use typed `addJobTo*Queue` helpers — never `queue.add()` directly
5. Wire the `getAIResponse` call with the correct endpoint constant
6. Add a webhook route in `routes/scanRoutes.js` with `verifyBasicAuth` middleware
7. Handle the webhook response: validate via Joi schema, dispatch to appropriate processing queue
8. Ensure proper state key handling (`ai_${runId}` or `aihtml_${runId}`) and cleanup on failure
9. Wire into consolidation — `sendResponse(..., type, subType, isLastResponse)` must be called at the end

## Key Files

| File                                                                  | Purpose                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `controllers/apiClient.js`                                            | `getAIResponse` — outbound HTTP to AI Service with retries                                    |
| `controllers/acceptAIResult.js`                                       | `acceptAIResult`, `acceptHeadingsAIResult`, `acceptCustomElementsAIResult` — webhook handlers |
| `routes/scanRoutes.js`                                                | Route definitions for AI webhooks                                                             |
| `config/constants.js`                                                 | `AI_API_ENDPOINTS`, `AI_WEBHOOK_ENDPOINT`, `CUSTOM_ELEMENTS_AI_REDIS_KEYS`                    |
| `worker/workerAI.js`                                                  | Alt-text AI job processing                                                                    |
| `worker/jobAIColorContrast.js`                                        | Color-contrast AI job processing                                                              |
| `worker/workerPreProcessAIhtml.js`                                    | Heading AI preprocessing (DOM stamping, S3 upload, AI call)                                   |
| `worker/workerPostProcessAIhtml.js`                                   | Heading AI postprocessing (DOM reconstruction, selector mapping)                              |
| `worker/workerCustomElementsAI.js`                                    | Custom-elements AI job processing                                                             |
| `checks/checkHandler-v2.js`                                           | B1 handler that gates heading AI enqueue via `enableHeadingAIRule`                            |
| `utils/redis-utils.js`                                                | `setAIHtmlMetadataIfAIKeyEmpty` (Lua atomic guard), `createAIrunIdMapping`, `getMetaData`     |
| `dom-forge-core/lib/core/runners/cookie-banner-detection-snapshot.js` | Cookie banner screenshot capture + direct AI Service call (runs on Percy)                     |

## See Also

- `flows/rule-types.md` — full AI fan-out table with queue/worker mapping
- `flows/workers.md` — worker process assignment
- `DEPENDENCIES.md` — AI API auth and config locations
- `docs/errors/ERROR-CATALOG.md` — AI webhook failure modes and recovery
