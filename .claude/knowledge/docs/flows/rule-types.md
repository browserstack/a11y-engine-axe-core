# Rule Types

> **Taxonomy is worker-based, not JSON-location-based.** Look at where the rule runs, not where the file sits.
>
> **Type C rules run in `dom-forge-core` on Percy — not in `ip-protection`.** `workerC.js` in `ip-protection` is a **result sink** for non-AI Type C; it does not execute rules. AI Type C rules take a separate path via `/accept_rules_data_percy`. See `dom-capture.md`.

## The five lanes

| Type | Where it runs | Rule JSON | Check/evaluate | Dispatcher | Queue → Worker |
|---|---|---|---|---|---|
| **A** | Browser (extension / SDK) | `a11y-engine-core/lib/rules/*.json` | `a11y-engine-core/lib/checks/*-evaluate.js` | `a11y-engine-core/lib/core/public/run.js` (default export `run()`) | — (synchronous, in-page) |
| **B1** | `ip-protection` main worker process | `ip-protection/rules/*.json` | `ip-protection/checks/combined-rules/*-evaluate.js` (+ `-v2` variants) | `worker/workerB1.js → processB1Job` | `typeB1Queue → workerB1.js` |
| **B2** | `ip-protection` main worker process | (Type B1 rules re-evaluated in aggregate) | Same `checks/combined-rules/` evaluators | `worker/workerB2.js → processB2Job` | `scanCompleteQueue → workerB2.js` |
| **C** (non-AI) | **`dom-forge-core` on Percy** | **`dom-forge-core/lib/core/runners/*.js`** | Via `axe.run()` inside dom-forge runners + `dom-forge-core/lib/checks/*-evaluate.js` | dom-forge-core invoked by Percy. Percy triggered by `processProxyMapRequest` in `controllers/getProxyMap.js` | Results POSTed to `/accept_percy_result` → `percyResultsQueue → workerC.js` (sink only) |
| **AI** | `ip-protection` AI worker process | `ip-protection/rules/*-ai.json` (with `counterpart`) | `ip-protection/checks/aiChecks.js` + external AI API | Multiple — see fan-out below | `aiTypeCProcessingQueue`, `preProcessAIhtmlQueue`, `postProcessAIhtmlQueue`, `customElementsAiQueue` |

Type A classification is driven by code-side arrays in `a11y-engine-core/lib/core/base/constants.js`: `TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`.

## Type C runners in `dom-forge-core`

| File (`dom-forge-core/lib/core/runners/`) | Purpose |
|---|---|
| `color-contrast.js` | Color contrast heuristic; if `color-contrast-ai` is enabled, hands candidates off to `/accept_rules_data_percy` with `type: 'color-contrast-ai-v1'`. Two-pass evaluation (gated by `fixed_sticky_two_pass` Redis flag) re-evaluates fixed/sticky overlays against the actual content beneath them. |
| `focus-visible.js` | Focus indicator visibility |
| `non-text-control-contrast.js` | UI component contrast |
| `reflow-4x-zoom-scroll.js` | Reflow at 400% zoom |
| `resize-2x-zoom.js` | Resize at 200% zoom |
| `text-in-images.js` | Detect text baked into images (uses OCR via `workerImage.js`) |
| `custom-elements-snapshot-capture.js` | Capture custom-element DOM for CE-AI |
| `meaningfulAltText/` | Meaningful alt-text AI candidate collection |
| `utils/cookie-banner-removal.js` | Pre-pass heuristic (gated by `cookie_banner_removal` Redis flag): detects CMP banners by selector + viewport-occupancy + provider globals and hides them before color-contrast / reflow runners execute. Covers ~12 CMPs (OneTrust, Cookiebot, TrustArc, etc.) plus a multilingual keyword fallback. |

Rules are driven by axe inside Percy (the dom-forge-core bundle imports a compiled axe script URL + dom-forge-core script URL, both served from S3).

## AI fan-out (the 4 AI sub-pipelines)

All run in the `aiWorker.js` process (see `workers.md`).

| Sub-type | Candidate ingress | Job name | Queue | Worker file | AI endpoint |
|---|---|---|---|---|---|
| Alt-text / image AI | `/accept_rules_data_percy` (`type: altText` default) | `AI_TYPE_C_PROCESSING` | `aiTypeCProcessingQueue` | `worker/workerAI.js → processAITypeCJob` | `suggest-alt-text` |
| Color-contrast AI | `/accept_rules_data_percy` (`type: color-contrast-ai-v1`) | `AI_COLOR_CONTRAST_PROCESSING` | `aiTypeCProcessingQueue` (shared) | `worker/jobAIColorContrast.js → processAIColorContrastJob` | `analyse-text-contrast` |
| Heading AI — preprocess | **B1 check handler** (`ip-protection/checks/checkHandler-v2.js`) enqueues after B1 dispatch when `enableHeadingAIRule(config, metadata)` is true. Preprocess decompresses B1 DOM, stamps `ally-id` on every visible element, uploads HTML + context to S3 via 2 presigned URLs, calls AI with `htmlSourceUrl`. | `PRE_PROCESS_AI_HTML` | `preProcessAIhtmlQueue` | `worker/workerPreProcessAIhtml.js → processPreProcessAIhtmlJob` | `analyze-heading-issues` — webhook lands on `/ai/webhook/heading`. Covers `missing-heading-ai` and `incorrect-heading-ai` in one call. |
| Heading AI — postprocess | `controllers/acceptAIResult.js:acceptHeadingsAIResult` stashes full AI response in Redis (`aihtml_postprocess_job@${runId}`) then enqueues minimal job. | `POST_PROCESS_AI_HTML` | `postProcessAIhtmlQueue` | `worker/workerPostProcessAIhtml.js → processPostProcessAIhtmlJob` | Downloads `aiHtmlProcessData` from S3, `reconstructDOM`, maps `elementId → selector` via `a11yIdToFullPathSelector`, formats nodes, adds dummy-pass entries for both rules, `sendResponse(..., 'C', AI_HTML, isLastResponse)`. |
| Custom-elements AI | `/accept_rules_data_percy` (`type: customElement`) | `CUSTOM_ELEMENTS_AI_PROCESSING` | `customElementsAiQueue` | `worker/workerCustomElementsAI.js → processCustomElementsAIJob` | `analyze-custom-element-interaction` |

**AI state keys**:
- `ai_${runId}` (Type C-originated — altText, color-contrast, customElements) — created by `createAIrunIdMapping` in `controllers/getProxyMap.js:processProxyMapRequest` **before Percy is invoked**, if `rules[]` contains `MEANINGFUL_ALT_TEXT_AI`, `COLOR_CONTRAST_AI_PSEUDO_LITERAL`, or `customElementsAI`.
- `aihtml_${runId}` (Heading AI — B1-originated) — created by `setAIHtmlMetadataIfAIKeyEmpty` in `utils/redis-utils.js`, called from `checks/checkHandler-v2.js`. Set via Lua script **only if `ai_${runId}` is empty**, so the two state keys are mutually exclusive per runId.

Both TTL `REDIS_TTL = 2 h`. The webhook controllers read whichever key is present to hydrate scanId/userId.

**AI auth**: outbound → `Authorization: Basic <BASIC_AI_AUTHTOKEN>` (from `${CONFIG.ai.username}:${CONFIG.ai.password}`). Webhook → `verifyBasicAuth` against rotating `BASIC_WEBHOOK_AUTHTOKEN_0` / `_1`.

## Asset workers (not rule types — support infrastructure)

| Purpose | Queue | Worker file | Triggered from |
|---|---|---|---|
| OCR on images for `text-in-images` | `imageProcessingQueue` | `worker/workerImage.js → processImageJob` | dom-forge-core / related flows via `addJobToImageProcessingQueue` |
| Build proxy map from uploaded asset zip | `buildProxyMapQueue` | `worker/proxyMapWorker.js → buildProxyMap` | `POST /build-proxy-map` |
| Result consolidation across B1/B2/C/AI | `consolidationQueue` | `worker/consolidationWorker.js → processConsolidationJob` | All lanes when done + `/timeout` |

## Rule JSON shape (same across A / B1 / C / AI)

```json
{
  "id": "aria-disabled",
  "selector": "dummySelector",
  "impact": "serious",
  "tags": ["cat.name-role-value", "wcag2a", "wcag412", "a11y-engine", "advanced"],
  "metadata": {
    "description": "...",
    "help": "...",
    "violationConfidence": 85,
    "needsReviewConfidence": 50
  },
  "all": ["aria-disabled"],
  "any": [],
  "none": []
}
```

AI rules additionally carry `"counterpart": "missing-heading"` pointing to the non-AI version. The "which worker runs this" decision does NOT come from the JSON — it comes from the rule tags + code-side arrays (`TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`) + the runtime's `configuration.runOnly.values` check inside each dom-forge runner.

## Note on Confluence taxonomy

Confluence's "AllyEngine Rule Categories" page lists **A / B1 / B2 / C1 / C2 / D**. In the current code:
- `C1` / `C2` do not exist as a distinction — code has a single `C` lane split only by AI vs non-AI output endpoint.
- `D` (assisted tests) is excluded from this scope.

## See also

- `dom-capture.md` — full Type C pipeline (a11y-engine-core → proxy-map → Percy → dom-forge-core).
- `workers.md` — queue + worker process mapping.
- `scan-lifecycle.md` — end-to-end multi-lane flow.
- `versioning.md` — B1/B2 version chain.
- `skills/stack:feature-dev.md` — step-by-step for adding a new rule.
