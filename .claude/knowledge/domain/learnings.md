# Learnings

Accumulated review and debugging learnings across the a11y-engine stack. Each entry has: **claim**, **why it matters**, **how to spot it**.

## Worker-based taxonomy beats JSON-location taxonomy

**Claim**: A rule's type (A / B1 / C / AI) is determined by **where its `evaluate` function runs at scan time**, not by which directory holds its JSON.

**Why it matters**: `ip-protection/workerC.js` is named after Type C but **does not run Type C rules** — Percy does (via `dom-forge-core` on Percy infrastructure). `workerC.js` is a result sink. New engineers waste hours looking for the rule logic in `workerC.js`.

**How to spot it**: Cross-reference the rule's id against `a11y-engine-core/lib/core/base/constants.js` (`TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`). The arrays drive dispatch.

## Two AI state keys, mutually exclusive

**Claim**: `ai_${runId}` (Type C-originated AI) and `aihtml_${runId}` (B1-originated heading AI) are **mutually exclusive per runId**. The exclusion is enforced via a Lua-atomic check in `setAIHtmlMetadataIfAIKeyEmpty`.

**Why it matters**: A scan with both Type C AI rules (e.g., `color-contrast-ai`) and heading AI in its `rules[]` array will only have **one** of the two keys populated. Webhook controllers must read whichever is present to hydrate `scanId/userId`. Forgetting this leads to "AI webhook arrived but no scan context" errors.

**How to spot it**: In any AI webhook handler in `controllers/acceptAIResult.js`, look for fallback logic that reads `aihtml_${runId}` when `ai_${runId}` is empty.

## All six `COMPLETION_TASK_TYPES.*` must be marked on kill paths

**Claim**: When `isKillSwitchActive` returns true in `controllers/buildProxyMap.js`, the controller marks **all six** `COMPLETION_TASK_TYPES.*` as done. Adding a seventh task or a new exit point that bypasses this pattern leaves the scan hanging.

**Why it matters**: Consolidation waits on every registered completion task. Missing one = stuck scan.

**How to spot it**: Grep for `COMPLETION_TASK_TYPES.` in the controllers — every new exit point must explicitly mark its task. Prefer the combined `sendResponse(..., task, isComplete)` signature over manual `markTaskCompleted` calls.

## Append-only versioning is the only ABI

**Claim**: Scans are long-running and asynchronous. A scan dispatched at `combined-rules-class-v10` may still be hydrating webhooks 30+ minutes later. **Editing v10 in place during that window breaks in-flight scans.**

**Why it matters**: The append-only file pattern (`-v1.js`, `-v2.js`, …, `-v14.js` extending each other) is what makes async scan replay safe. Same for `commons/v2/*-vN.js` and `*-evaluate-vN.js`.

**How to spot it**: A diff that modifies any file matching `combined-rules-class-v[0-9]+\.js`, `commons/v2/.+-v[0-9]+\.js`, or `.+-evaluate-v[0-9]+\.js` in place is a critical block in code review.

## BullMQ payloads are tiny — Redis holds the state

**Claim**: BullMQ jobs carry **IDs only**, never raw DOM, AI HTML, or asset bytes. The state lives in Redis under a TTL-bound key; the job carries the key.

**Why it matters**: A 5MB DOM payload retried 6 times (`buildProxyMapQueue`) is 30MB of duplicated Redis storage. With concurrent scans, this OOMs Redis.

**How to spot it**: Any `addJobTo*Queue({ ...big object... })` is suspect. The right shape is `addJobTo*Queue({ scanId, runId, redisKey })`.

## `dummySelector` is not a real selector

**Claim**: Type C rule JSON often has `"selector": "dummySelector"`. The real selector is computed inside the runner on Percy.

**Why it matters**: Tools that statically evaluate rule JSON (e.g., a UI that previews "which elements does this rule target?") cannot use the JSON `selector` for Type C rules — they need to query the runner.

**How to spot it**: If your tool returns "0 matched elements" for every Type C rule, you're trusting `selector` literally.

## `verifyBasicAuth` accepts a token if it matches EITHER rotating secret

**Claim**: `verifyBasicAuth` in `utils/middleware.js` rejects when `token !== AUTHTOKEN_0 && token !== AUTHTOKEN_1` — i.e., the token must match **one of the two** active webhook secrets. The previous `||` form (which always rejected unless both secrets were equal) was the bug that necessitated setting both env vars to the same value in prod.

**Why it matters**: This is the canonical two-key rotation pattern — flip `BASIC_WEBHOOK_AUTHTOKEN_0` while `_1` still accepts in-flight webhooks, then swap. Reverting to `||` re-introduces the lockout. Any change to this predicate must be reviewed against the rotation runbook in `knowledge/docs/flows/auth.md`.

**How to spot it**: Any PR that re-orders or simplifies the two-token check in `verifyBasicAuth`. Reject anything that collapses both comparisons into a single equality, or flips `&&` back to `||`.

## `workerC.js` filters `color-contrast-axe` from incomplete — by design

**Claim**: `workerC.js → processTypeCJob` filters `color-contrast-axe` rule ID from the `incomplete` result set before posting.

**Why it matters**: The axe-level `color-contrast-axe` incomplete is reported separately via the AI path (`color-contrast-ai`). Without the filter, the same items would be double-reported.

**How to spot it**: A user reports "color-contrast-axe missing from scan response" — by design. Look at `color-contrast-ai` in the AI lane instead.

## Submodule URL must point at BrowserStack's fork

**Claim**: `.gitmodules` for `axe-core/` must point to `git@github.com:browserstack/a11y-engine-axe-core.git` on the `main` branch — **not** the public Deque mirror.

**Why it matters**: A naive `git submodule update --init` from a fresh clone can silently pick up the wrong remote if `.gitmodules` ever drifted. The BrowserStack fork contains custom rule logic and tags (`a11y-*:`) that don't exist upstream.

**How to spot it**: Check `cat .gitmodules`. If it ever changes to point at Deque, **revert immediately**.

## Two outbound auth schemes — easy to mix up

**Claim**: `apiClient.js` has two outbound helpers with different auth:

- `sendResponse(...)` → WebA11y backend (`/api/a11y_engine_jobs`), auth `Basic BASIC_AUTHTOKEN`.
- `getAIResponse(...)` → AI API, auth `Basic BASIC_AI_AUTHTOKEN`.

**Why it matters**: Calling the wrong one returns 401 silently mid-scan. Newcomers often confuse the two because the `Authorization` header shape is identical.

**How to spot it**: Grep for `axios.post.*Authorization.*Basic` outside `apiClient.js`. There should be none — both calls live inside the helper.

## Karma/Mocha (browser) and Jest (server) — don't mix

**Claim**: `a11y-engine-core` uses **Karma + Mocha + Chai**. `dom-forge-core` uses **Mocha** (no Karma). `ip-protection` uses **Jest**.

**Why it matters**: Importing `expect` from `chai` in an `ip-protection` test won't work; importing Jest globals in `a11y-engine-core` won't work either. New engineers sometimes try to standardize on one framework — don't.

**How to spot it**: Look at the package's `package.json` `scripts.test` — that's the source of truth.

## Logger vs EDSUtils — cost matters

**Claim**: `logger.log({kind, action, f0, f1})` is 2-week retention and cheap. `new EDSUtils(eventType, scanId).sendXxx(...)` is BigQuery-bound and expensive.

**Why it matters**: Bursting EDS events from a per-element loop is an easy way to burn the EDS budget. Latency events emitted in `workerC.js`'s `finally` block are the canonical example of **correct** EDS usage (one per scan, terminal block).

**How to spot it**: Grep for `new EDSUtils(...)` inside any per-element loop — that's a smell.

## Never log raw tokens, even in dev

**Claim**: `utils/middleware.js` currently logs `authHeader` at `info`. This pattern is **not to be copied** in new routes — even though `IS_DEVELOPMENT_ENV` short-circuits some auth, log scrubbing is best applied uniformly.

**Why it matters**: A dev log can be uploaded to a shared system later; a prod log can land in a search index.

**How to spot it**: Any new `logger.log(...)` that interpolates `req.headers.authorization` or `socket.handshake.auth.token` without redaction.

## Scan version field comes from metadata, not from JSON

**Claim**: The B1 version dispatch reads from `scan_metadata.version` (e.g., `"v14"`), and `combined-rules-worker-thread.js` loads `combined-rules-class-${version}.js` dynamically. The rule JSONs themselves don't carry version.

**Why it matters**: Engineers sometimes assume "I should version the rule JSON" — no. Versioning happens in the `combined-rules-class-vN.js` chain, not in JSON files.

**How to spot it**: Any PR that adds a `"version"` field to a rule JSON. Reject — that's not how dispatch works.

## `scan_state:${runId}` TTL of 60s is a tight window

**Claim**: `SCAN_STATE_TTL` is 60 seconds. If `notifyRunStatus` arrives before `scan_started`, it queues at `scan_pending_status:${runId}` (also 60s) and flushes when `scan_state` is set. If neither lands within 60s, statuses get dropped.

**Why it matters**: Slow clients (low bandwidth, big DOM) can race the TTL. Symptoms: "scan started" log present, "status update never received" downstream.

**How to spot it**: Cross-reference timestamps on `scan_started` socket event and the first `notifyRunStatus` for the same `runId`. If >50s gap, this is the cause.

## AI workers are split into short and long buckets — preserve the partition

**Claim**: `aiWorker.js` (short bucket) drains `aiTypeCProcessingQueue`, `customElementsAiQueue`, and the short on-demand/workflow-analyser queues. `aiWorkerLong.js` (long bucket) drains `preProcessAIhtmlQueue`, `postProcessAIhtmlQueue`, and the `*Long` on-demand/workflow-analyser queues. Both share `worker/aiWorkerRuntime.js`'s round-robin + priority-lane loop, but the queue partitioning is what prevents long jobs from starving short ones.

**Why it matters**: Routing a long-running heading-AI job onto a short-bucket queue (or vice versa) re-introduces the starvation that motivated the split. The choice is made inside `utils/bullmq.js → addAIJobToQueue` based on `job.name`; do not move that decision into individual callers.

**How to spot it**: Any new caller of `queue.add(...)` on an AI queue (instead of `addAIJobToQueue`). Any change to `entrypoint.sh` that conflates `AI-WORKER` and `AI-WORKER-LONG` contexts.

## AI `reason` flows from the model into rule metadata — sanitize at the boundary

**Claim**: `worker/workerAI.js` reads the optional `result.reason` field from the AI response, runs it through `sanitizeAIReason` (`utils/helpers.js`: trim, drop non-strings, cap at 1000 chars), and conditionally attaches `{ reason }` to the rule metadata at all three formatting branches (success/violation, suggested-alt-text, custom rule formatter).

**Why it matters**: The AI service can emit unbounded or non-string reasoning text. Persisting it raw would inflate weba11y payloads and break JSON consumers downstream. New AI sub-pipelines (or new rule-metadata wrappers) must call `sanitizeAIReason` at the same boundary — not at the consumer.

**How to spot it**: Any `result.reason` or `result.result.reason` access outside `worker/workerAI.js` that does not pass through `sanitizeAIReason`. Any new AI rule that bypasses the existing 1000-char cap.

## Oversized Type C results are batched, not discarded

**Claim**: `utils/batchHelper.js → splitTypeCResultIntoBatches` splits a Type C result into node-level batches whose serialized size stays under `TYPE_C_BATCH_PAYLOAD_BYTES` (= `CONFIG.a11y.payload_size_limit`, default 2 MiB). Each batch carries a shallow rule shell with its node subset so weba11y can merge by rule id. Empty result sets still produce one empty batch so `eof` and consolidation telemetry remain consistent.

**Why it matters**: Pre-batching, weba11y rejected (and `acceptResult.js` finalised as FAILURE) any Type C result over the limit, dropping nodes silently. The batch loop computes EOF once per job via `eofOverride` — calling `getEOFStatus` per batch would enqueue consolidation multiple times.

**How to spot it**: Direct `sendResponse(...)` calls for Type C results that bypass `batchHelper`. Any per-batch `getEOFStatus` call that does not thread `eofOverride` through.

## B1 ack-latency is a non-fatal observability signal

**Claim**: `worker/workerB1.js → appendAckMissingError` folds a missing `dataCollectionLatencyWithAck` into `finalResultForEDS.errors` as an `INSTRUMENTATION_ERROR` **without** flipping the scan to FAILURE. The ack timeout is 2 s (`checks/checkHandler-v2.js → awaitDataCollectionAck`); older client SDKs (pkg ≤ 5.2.0) never ack and the missing value is the expected state for them.

**Why it matters**: A missing ack means we lost a metric, not the scan. Promoting it to a failure causes false alerts. Conversely, dropping the EDS errors-bucket entry hides the metric loss — the alert pipeline counts those entries as `instrumentation_errors`.

**How to spot it**: PRs that conditionally `throw` or `setScanFailed` based on `latencyWithAck` nullity. PRs that omit the `appendAckMissingError` call when introducing a new B1 exit point.

## FUP simulate must stay observe-only

**Claim**: `utils/fup/fupService.js → simulateFUP` runs an atomic Lua sliding-window across both per-group and system-wide lanes, but its caller (`utils/scanStartedHandler.js`, `worker/jobAIColorContrast.js`) only **records** the decision (Redis `fup_result:${runId}` TTL 2 h, EDS enrichment, hoothoot metrics). It never short-circuits the scan. Master switch: Redis `FUP_SIMULATE_ENABLED='true'`; absence = instant rollback.

**Why it matters**: Wiring the simulate decision into a real allow/deny path before the simulate phase is reviewed would change customer behavior based on un-validated thresholds. The hardcoded fallbacks (`aut_ws: 4000`, `wa: 600`, global 4000) are derivation seeds, not committed limits.

**How to spot it**: Any `if (!fupResult.allowed)` branch that returns early, throws, or marks a completion task. Any code that reads `fup_result:${runId}` outside the EDS-emit helpers.

## `READONLY` reconnect is centralised — don't re-hand-roll it

**Claim**: `REDIS_OPTIONS.reconnectOnError` (in `config/constants.js`) returns true for any error whose message includes `READONLY`. Every `ioredis` client constructed from `REDIS_OPTIONS` (including BullMQ workers and the cache layer) recovers from elasticache primary→replica failover via this single predicate. `utils/elasticache.js` adds only a `reconnecting` log listener.

**Why it matters**: Past patches added per-call `reconnectOnError` blocks inside `acceptRulesDataPercy.js` and `utils/bullmq.js`, each with subtly different error-message matching. Drift between them meant some clients hung on failover. Centralising means new clients get failover-safety for free; per-call overrides are forbidden.

**How to spot it**: Any `new Redis({ reconnectOnError: … })` outside `config/constants.js`. Any `if (err.message.includes('READONLY'))` block in a worker or controller.

## Single-write to the accessibility bucket — no OCR-bucket fallback

**Claim**: Per-resource assets and proxy-map JSON are written **only** to the accessibility bucket (`resolveAccessibilityBucket()` in `utils/s3Utils.js`). The earlier dual-write to the OCR bucket and the `dualPutAsset` / `uploadAssetWithDualWrite` helpers in `proxyMapWorker.js` are gone. Both Percy and `ip-protection` readers source from the accessibility bucket.

**Why it matters**: A reader that still falls back to the OCR bucket will return stale or missing objects. A writer that re-introduces dual-write doubles S3 cost and re-opens the consistency window that motivated the cutover.

**How to spot it**: Any new `uploadAssetFile(...)` call that passes the OCR bucket explicitly. Any `Promise.allSettled([primary, secondary])` write pattern resembling the removed `dualPutAsset`.

---

## Top 10 production bug sources (distilled from ~80 PRs)

Ranked roughly by frequency in retros and #team-allyengine-pr-reviews. Each maps to one or more rule files; treat this as the prioritized reviewer-attention list.

1. **Missing null checks in shared/common functions.** One null in `utils/`, `commons/helper.js`, or `controllers/apiClient.js` cascades into every consumer. The Jan 2026 ResponsivenessAT prod break started here. → `rules/api-design.md` §"Null safety in shared helpers".
2. **Common-function changes breaking other rules/ATs.** A "small refactor" to a shared utility usually has more callers than the author counted. PR descriptions for shared-helper changes must enumerate every consumer; tests must cover each. → code-reviewer agent rule.
3. **Race conditions in workers.** B2 scans, concurrency handler leaks, lock duration vs p99 mismatches (PR #2240). → `rules/api-design.md` §"Worker registration" + §"Concurrency math".
4. **Feature-flag truthiness.** String `'false'` is truthy in JS. Redis returns `0/1` (often as strings). `if (flag)` silently flips OFF flags ON (PR #2098, #2071, #2024). → `rules/frontend-components.md` §"Feature flag truthiness".
5. **Shadow DOM traversal failures.** `querySelector` ignores shadow trees by default; B1 async logic loses elements across shadow roots. Always test with shadow-DOM-heavy sites (e.g., Material-UI, Salesforce Lightning). → `knowledge/TESTING.md` testing matrix.
6. **Silent failures returning empty results.** Decompression error → `violations: []` → consolidation sees a passing empty scan (PR #2049). Mark `COMPLETION_TASK_TYPES.*` as failed, never return `[]`. → `rules/api-design.md` §"Silent failures forbidden".
7. **IP-protected logic shipped to frontend.** Evaluation, scoring, heuristics in `a11y-engine-core` or the extension is visible to anyone who unpacks the bundle. Stays in `ip-protection` (PR #2020). → `rules/security.md` §"Frontend ↔ backend boundary".
8. **Unintended merge artifacts.** Test URLs, local machine paths, `proxy_map.json`, debug `console.log` from local dev. Always `git diff` before pushing. → pre-deploy checklist in `knowledge/DEPLOYMENT.md`.
9. **Redis stress not validated before prod.** Code that's O(scans × items_per_scan) on Redis works on staging (10 scans/min) and falls over in prod (300 scans/min). Stress-test on a lower environment with realistic concurrency. → `knowledge/TESTING.md` + `rules/api-design.md` §"Concurrency math".
10. **Rule research → implementation gap.** Research spec covered an edge case the implementer didn't read; that case ships broken (Akhil, Feb 2026). When adding/modifying a rule, the PR description must cite the research doc section and explicitly list which spec cases are covered. → `skills/stack:feature-dev.md` planning phase.
