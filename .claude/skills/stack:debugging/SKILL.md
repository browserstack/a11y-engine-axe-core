---
name: stack:debugging
description: Debugging skill for a11y-engine — false-positive investigation on a live page, scan-flow tracing, worker-state inspection, and proxy-map replay via mini-percy-renderer (Darwin-arm64 only).
---

# Skill: stack:debugging — Debugging a11y-engine

## When to invoke

Use this skill when the user reports:
- A rule **false positive** ("why is this flagged?", "this isn't a violation").
- A scan that **never completes** ("hangs", "no response", "stuck on Type C").
- A worker that **crashes or retries** ("workerB1 keeps failing", "AI webhook never came back").
- A **race or ordering** issue ("response arrived before B1 finished", "EOF marker missing").
- A submodule **regression** ("axe-core update changed this rule's output").

## Phase 1 — Classify the bug

Ask the user (or infer from context):

| Symptom | Lane | First file to open |
|---|---|---|
| Rule fires on a node that doesn't violate the SC | A / B1 / C / AI — depends on rule | `knowledge/docs/flows/rule-types.md` |
| Scan never completes | Cross-lane — usually consolidation | `knowledge/docs/flows/scan-lifecycle.md` |
| Worker keeps retrying | Worker — check queue + lock | `knowledge/docs/flows/workers.md` |
| Webhook lands but result is wrong | AI sub-pipeline | `knowledge/docs/flows/rule-types.md` § AI fan-out |
| Redis key not found / expired too soon | TTL bug | `knowledge/docs/flows/storage.md` |
| Auth fails on a new route | Middleware | `knowledge/docs/flows/auth.md` |

## Phase 2 — False positive (rule-level)

When the user says "rule X fired on URL Y, is it a real violation?", **delegate to `stack:debug-fp`** — it owns the full live-page workflow (Chrome MCP integration, axe injection, port-to-browser scripts, proxy-map replay via `mini-percy-renderer/`, and the FP/TP classification rubric).

Use this phase only for the classification + paper-triage that decides whether to invoke `stack:debug-fp`:

| Intake | Required | Preferred |
|---|---|---|
| Rule-level FP | `rule-id`, `url` | One or more CSS selectors (always a list — same DOM node may be reported via multiple paths; de-duplicate by node identity) |

**AI vs non-AI:** If the rule has both routes (e.g., `color-contrast` and `color-contrast-ai`), ask which mode produced the violation before invoking `stack:debug-fp`.

**Paper-triage first.** With algorithm + public docs + the user's `outerHTML`, you can often decide statically without driving the browser:

- Algorithm has an early-return branch the element matches → predict verdict.
- Cited WCAG SC demonstrably doesn't apply (e.g., 4.1.2 cited, element is not a UI component) → **FP by design**, no drive needed.
- Decision depends on computed style / layout / shadow DOM → invoke `stack:debug-fp` to drive the browser.

State the hypothesis in one sentence. If a drive is needed, invoke `/stack:debug-fp <rule-id> <url> [selectors…]`. That skill handles intake, rule location, axe injection, paper-triage refinement, browser drive (live URL or proxy-map replay), two-axis classification (WCAG + algorithm), and the structured report.

## Phase 3 — Scan-flow tracing

When a scan hangs or produces wrong consolidated output:

1. **Find the runId.** From the user's scan ID, locate `runId` in the trace.
2. **Check completion task state.** `COMPLETION_TASK_TYPES.{TYPE_C, TEXT_IN_IMAGES, AI_STANDARD, AI_COLOR_CONTRAST, AI_HTML, AI_CUSTOM_ELEMENTS}`. Each must be marked complete before consolidation fires.
3. **Check the right Redis keys for state**:
   - `scan_state:${runId}` — STARTED flag (60s TTL, set by socket `scan_started`).
   - `scanComplete:${scopeKey}:${type}` — per-type completion flag (15 min TTL).
   - `ai_${runId}` — Type C-originated AI state (2h TTL).
   - `aihtml_${runId}` — B1-originated heading AI (2h TTL, mutex with `ai_${runId}`).
   - `b1_data:${scanId}@${uuid}` — accumulated B1 DOM chunks (1h TTL).
   - `resources:${scanId}` — proxy-map resource tracker (8h TTL).
   - `proxymap_metadata@${runId}` — CE-AI coordination metadata.
4. **Check the queue depth for each worker process** (`main` worker.js vs aiWorker.js):
   - Per-queue inspection via BullMQ dashboard or `redis-cli` against the queue's Redis keys.
5. **Was the kill-switch triggered?** If yes, all six completion tasks are marked done by `controllers/buildProxyMap.js`; no Percy call happens.
6. **Did `sendResponse` actually fire?** Search `ip-protection` logs for `Chitragupta.setMetaData('userId', ...)` correlation lines.

## Phase 4 — Worker crashes / retries

1. Find the worker file from the queue name (see `knowledge/docs/flows/workers.md`).
2. Check the **lock duration** — if processing takes longer than the lock, BullMQ retries. `QUEUES_LOCK_DURATION` = 2 min. Image processing uses `_EXTENDED` (5 min). B2 uses `_EXTENDED_15_MIN`.
3. `buildProxyMapQueue` is configured with 6 attempts + exp backoff. `scanCompleteQueue` (B2) with 2 attempts.
4. Look for `removeOnComplete` / `removeOnFail` config differences — defaults are `age: 3 days`, counts from `CONFIG.bullmq.removeOnCompleteCount` / `removeOnFailCount`.
5. Shutdown — both processes use `setupWorkerShutdown`. Stale workers may indicate SIGTERM handlers not being registered for new queues.

## Phase 5 — AI webhook never returned

1. Which AI sub-pipeline? Check the worker:
   - alt-text / image-alt AI → `workerAI.js` → `processAITypeCJob`
   - color-contrast AI → `jobAIColorContrast.js` → `processAIColorContrastJob`
   - heading AI → `workerPreProcessAIhtml.js` → `workerPostProcessAIhtml.js`
   - custom-elements AI → `workerCustomElementsAI.js` → `processCustomElementsAIJob`
2. Check the **AI state key**:
   - `ai_${runId}` for Type C-originated. Created by `createAIrunIdMapping` **before Percy is invoked** in `controllers/getProxyMap.js:processProxyMapRequest`.
   - `aihtml_${runId}` for heading AI. Created via Lua-atomic `setAIHtmlMetadataIfAIKeyEmpty` from `checks/checkHandler-v2.js`.
3. Check webhook **auth** — `verifyBasicAuth` against `BASIC_WEBHOOK_AUTHTOKEN_0` or `_1`. **Known bug**: condition `token !== AUTHTOKEN_0 || token !== AUTHTOKEN_1` effectively rejects every token unless both env vars hold the same value. Intent is `&&` for key rotation.
4. Check **idempotency gate** — `acceptRules_${type}_${runId}` for `/accept_rules_data_percy`. Stuck if Redis key remains set.
5. Check AI API health — outbound call from `controllers/apiClient.js:getAIResponse` uses `Basic BASIC_AI_AUTHTOKEN`. Retries on 502/503/504/429 + network errors.

## Phase 6 — Submodule regression

1. The submodule is `axe-core/`, pinned to BrowserStack's fork branch `main` at the URL `git@github.com:browserstack/a11y-engine-axe-core.git`.
2. **Never `git submodule update --init` against upstream Deque.**
3. Use `git -C axe-core log <range>` to scope the regression.
4. Look for missing impact tags (`a11y-critical`, `a11y-core`, etc.) in the offending commit — that's a smell.

## Operating notes

- One tab per investigation. State what you're about to click/type before acting — browser actions are user-visible.
- The user's browser session carries real cookies/credentials. Do not persist scan data beyond `/tmp/debug-fp-<rule-id>.js` and the report.
- Scope: debug, not rewrite. Rule fixes go through `skills/stack:feature-dev.md`.
- Shadow DOM / cross-origin iframes: note the limit upfront; cross-origin iframes are usually unreachable.
- Background `kill` on jackproxy / launch-proxy-chrome exits with code 143 (SIGTERM) — that's normal shutdown, not failure.
