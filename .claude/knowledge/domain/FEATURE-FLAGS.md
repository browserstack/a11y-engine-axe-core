# Feature Flags

a11y-engine has no traditional feature-flag SaaS provider (LaunchDarkly, Split, etc.). The equivalent runtime control surface is a set of **caches initialized at `ip-protection` startup** that gate rule execution per-customer and per-scan.

## The three startup caches

In `ip-protection/app.js`, on server start, three caches initialize **in parallel**:

| Cache | Initializer | Stores | Used by |
|---|---|---|---|
| **Rules cache** | `initializeRulesCache()` (`utils/ruleFilter.js`) | Which rules run per scan, per product, per environment | Every scan's rule-selection step |
| **Kill-switch cache** | `refreshAllKillSwitchCaches()` (`utils/killswitch-utils.js`) | Per-customer rule disablements; the "global kill switch" predicate | `controllers/buildProxyMap.js:isKillSwitchActive(userId, groupId, scanId)` |
| **Timeout cache** | `initializeTimeoutCache()` (`utils/timeout-cache.js`) | Per-group timeouts for B-type and Type C scans | Worker timeout guards |

Any scan reads from all three at dispatch time.

## Kill-switch behavior

When `isKillSwitchActive(userId, groupId, scanId)` returns **killed**, `controllers/buildProxyMap.js` marks **all six** `COMPLETION_TASK_TYPES.*` as already-done so run-tracking doesn't hang on dead pipelines:

- `COMPLETION_TASK_TYPES.TYPE_C`
- `COMPLETION_TASK_TYPES.TEXT_IN_IMAGES`
- `COMPLETION_TASK_TYPES.AI_STANDARD`
- `COMPLETION_TASK_TYPES.AI_COLOR_CONTRAST`
- `COMPLETION_TASK_TYPES.AI_HTML`
- `COMPLETION_TASK_TYPES.AI_CUSTOM_ELEMENTS`

…and returns 200 immediately. No Percy call, no downstream work. **Any new kill-switch-protected entry point must follow this six-task pattern.**

## Per-rule feature gates inside the code

Rules can gate themselves on metadata via helpers in the check handlers:

- `enableHeadingAIRule(config, metadata)` — gates the Heading AI preprocess. When true, `ip-protection/checks/checkHandler-v2.js` enqueues `PRE_PROCESS_AI_HTML` after B1 dispatch.
- `isCustomElementAISession` — a similar gate for the Custom Elements AI fan-out.
- `applyConsolidation` flag — present on `req` (set by `verifyAPIAuthToken`). Causes the response path to additionally `setConsolidationFlag` before invoking Percy.

These are **not** feature flags in the SaaS sense — they're code-level gates that read from the request payload, the rules array, and the per-group config.

## Per-customer Redis feature gates

Resolved via `isFeatureEnabledRedis(featureName, userId, groupId, scopeKey)` in `utils/redis-utils.js`. Checks per-user, per-group, and global Redis keys; returns `Boolean`. Known consumers:

| Feature key | Helper | Where it gates |
|---|---|---|
| `cookie_banner_removal` | `isCookieBannerRemovalEnabledRedis` | `dom-forge-core/lib/utils/cookie-banner-removal.js` invocation in color-contrast and reflow runners |
| `fixed_sticky_two_pass` | `isFixedStickyTwoPassEnabledRedis` | Two-pass color-contrast evaluation (`dom-forge-core/lib/checks/color-contrast-evaluate.js`) |

The string `'true'` is the only accepted "on" value at the all-users level; per-user / per-group lookups accept truthy presence. Treat the helper's return strictly as boolean — `if (rawRedisValue)` on the raw read flips OFF flags ON when Redis returns `'false'` (see `learnings.md` § "Feature-flag truthiness").

## FUP simulate (observe-only rate-limit instrumentation)

`utils/fup/` adds a sliding-window rate-limit **simulator** — counts full-page runs per group/plan/product against per-group and system-wide caps, logs the decision, and enriches existing B1/C/AI/B2/TII/AICC EDS events with the simulated allow/deny. It **never denies a scan**; gating production behavior on it is out of scope until the simulate phase is reviewed.

- Master switch: Redis key `FUP_SIMULATE_ENABLED` (`'true'` = on; absent / anything else = off). 30 s in-memory cache. Absence is the instant-rollback path.
- Thresholds resolve in three levels: `fup:override:${groupId}` (per-group JSON), then `fup:plan_defaults:${planName}` (`Freemium | Essential | Ultimate | Enterprise`), then hardcoded `{ aut_ws: 4000, wa: 600 }`. Global engine cap reads `fup:global_cap` (single integer across all groups/products) with hardcoded fallback `4000`.
- Decision is the **intersection** of group-lane AND global-lane sliding windows. The two lanes always `INCRBY` so telemetry reflects true arrival volume even when one lane denies.
- Both invocation sites (`utils/scanStartedHandler.js` for B1/B2/C/AI/TII; `worker/jobAIColorContrast.js` for AICC) call `fupService.simulateFUP` and stash the result on `fup_result:${runId}` (TTL 2 h) so EDS-emit helpers can enrich it later.

## Rule classification arrays (compile-time)

The fastest "feature flag" of all: edit a constant array.

- `a11y-engine-core/lib/core/base/constants.js` — `TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`.
- A rule that you want to **move between lanes** (e.g., from B1 to AI) is moved by editing these arrays plus the dispatch table — not by toggling an external flag.

## Environment-gated behavior

| Behavior | Gate | Where |
|---|---|---|
| Dev escape hatch for auth | `IS_DEVELOPMENT_ENV` | `utils/middleware.js` — `verifyToken` uses `jwt.decode` (no signature verify); `verifyBasicAuth` short-circuits to `next()` |
| S3 Transfer Acceleration | env ∈ {`preprod`, `production`, `dr`} | `utils/s3Utils.js` — selects `s3clientWithAcceleration` |
| Automation routes | `preprod` only | `controllers/automation/*` — returns 400 outside preprod |
| Read replica fallback | (always available) | `REDIS_READ_REPLICA_OPTIONS` defined in `config/constants.js` |

## Reloading the caches

The caches refresh at server startup. There is no in-flight cache refresh for rule definitions — to apply a new rules configuration, restart the `ip-protection` server process.

Per-customer kill switches refresh through `refreshAllKillSwitchCaches()`. Check `utils/killswitch-utils.js` for its refresh cadence.

## Adding a new gate

If you need a runtime gate (e.g., "only run rule X for customers in group Y"):

1. Add a key to the per-group config (loaded from `config.yml` plus per-group overrides).
2. Read it inside the rule's dispatch handler (`combined-rules-class-v(N+1).js` if B1, the dom-forge runner if C, the AI sub-pipeline if AI).
3. Do **not** stash it in Redis without a TTL — see `rules/security.md`.

If you need a **kill switch**, follow the existing `killswitch-utils.js` pattern and remember to mark all six completion tasks on the kill path.
