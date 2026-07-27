---
name: stack:feature-dev
description: Feature, rule, and worker development lifecycle for the a11y-engine (Spectra) monorepo — intake, locate, plan, implement, version safely, test, and PR.
---

# Skill: stack:feature-dev — Feature Development Lifecycle

## Purpose

Structured workflow for any code change in the a11y-engine monorepo: adding a rule (Type A/B1/C/AI), changing a worker, adding a route, bumping a `combined-rules-class-vN`, or touching the axe-core submodule.

## When to invoke

Use this skill whenever the user asks to: build, implement, fix, add, change, or modify anything in `a11y-engine-core/`, `ip-protection/`, `dom-forge-core/`, `mini-percy-renderer/`, or `axe-core/`. Do NOT skip this lifecycle.

## Prerequisites

- A Jira ticket ID is required. If not provided, ask: "Please share the Jira ticket ID for this work."
- Node 18.20.4 active. Run `nvm use 18.20.4`.
- For `ip-protection` changes touching scans: the local backend (`npm run dev`) and worker (`npm run worker`) should already be running. See `knowledge/SETUP.md`.

## Phase 1 — Intake

1. Confirm the Jira ticket ID and fetch its description.
2. **Locate the research spec.** For any rule change or AT change, find the research / WCAG analysis doc the work is based on (Confluence, ticket attachment, design doc). Read the spec end-to-end. **List every spec case explicitly in your plan and confirm the implementation will cover each.** A spec case the implementation silently misses is the #10 prod-bug source on this codebase (Feb 2026 incident).
3. Classify the change:
   - **New rule** (which lane: A / B1 / B2 / C / AI?)
   - **Worker / dispatch change** (which queue?)
   - **HTTP route or socket event** (auth middleware needed?)
   - **commons / helper change** (does it need a `-v2` sibling? List every consumer.)
   - **axe-core submodule** (which impact tag?)
4. Identify which sub-project(s) you'll touch — usually one of `a11y-engine-core`, `ip-protection`, `dom-forge-core`.

## Phase 2 — Locate

Read **before writing any code**:

1. `knowledge/docs/flows/overview.md` — package responsibilities.
2. `knowledge/docs/flows/rule-types.md` if this is a rule change — taxonomy is worker-based, not JSON-location-based.
3. `knowledge/docs/flows/scan-lifecycle.md` if the change affects scan flow.
4. The relevant per-package rules file:
   - `a11y-engine-core` or `dom-forge-core` → `rules/frontend-components.md`
   - `ip-protection` → `rules/api-design.md`
5. `rules/database-migrations.md` if the change touches any `combined-rules-class-vN`, `commons/v2/*`, or `*-evaluate-vN.js`.

## Phase 3 — Plan

Present the implementation plan to the user before touching any file:

```
## Implementation Plan: <Jira-ID>: <title>

Lane / type:    <A | B1 | B2 | C | AI | route | worker | commons>
Sub-project(s): <a11y-engine-core | ip-protection | dom-forge-core | axe-core>

### Files to create
- <path>
- <path>

### Files to modify (NON-VERSIONED — safe to edit in place)
- <path>

### Files NOT modified (versioned — would require a new sibling)
- (none) OR
- combined-rules-class-vN.js → will create combined-rules-class-v(N+1).js
- foo-evaluate.js → will create foo-evaluate-v2.js

### New queue / route / socket?
- Queue: <name> — add to utils/bullmq.js, bind in <worker.js|aiWorker.js>, add to setupWorkerShutdown
- Route: <method> <path> — auth: <verifyAPIAuthToken | verifyBasicAuth | …>
- Socket: <event> — inherits verifySocketAuthToken via io.use

### Tests
- <test file path>
- Covers: happy path, null/missing DOM, error path

### Risk / compatibility
- In-flight scans on older versions: not affected (append-only)
- Submodule tag (if axe-core change): <a11y-critical | a11y-core | a11y-rule-X | a11y-ip | a11y-domforge>
```

Wait for confirmation before proceeding.

## Phase 4 — Implement (rule-type-specific)

### Type A (client-side, in-page only)

1. Check definition — `a11y-engine-core/lib/checks/<category>/<rule-name>.json`.
2. Check evaluator — `a11y-engine-core/lib/checks/<category>/<rule-name>-evaluate.js`.
3. Rule JSON — `a11y-engine-core/lib/rules/<category>/<rule-name>.json`.
4. If the rule needs the dispatch table: classify in `lib/core/base/constants.js` arrays.
5. Test fixtures + assertions in `a11y-engine-core/test/`.

### Type B1 (client capture + server batch eval)

1. Client portion — same as Type A in `a11y-engine-core`.
2. Server rule JSON — `ip-protection/rules/<rule-name>.json`.
3. Server evaluator — `ip-protection/checks/combined-rules/<rule-name>-evaluate.js` (or `-v2`).
4. **If the rule needs to plug into the combined-rules class chain**: create `worker/combined-rules-class-v(N+1).js` extending the current top version, spread-and-add to `getRuleFunctionMapping()` and `getShortenedRuleKey()`. **Never edit existing `-vN.js`.**
5. Server commons — if you need new helpers, add `commons/v2/<name>.js` (or `<name>-v2.js` if siblinging an existing file).
6. Test — Jest in `ip-protection/test/`.

### Type C (non-AI, runs on Percy)

1. Runner — `dom-forge-core/lib/core/runners/<rule-name>.js` (Percy-side).
2. Evaluator — `dom-forge-core/lib/checks/<rule-name>-evaluate.js`.
3. **Note `dummySelector` trap** — Type C rule JSON often has `"selector": "dummySelector"`; the real selector is computed inside the runner.
4. Ensure result POST lands at `/accept_percy_result` → `percyResultsQueue` → `workerC.js`. **`workerC.js` is a sink — it does not run the rule.**
5. Test — Mocha in `dom-forge-core/test/checks/`.

### Type AI (Type C with AI counterpart)

1. AI rule JSON — `ip-protection/rules/<rule-name>-ai.json` with `counterpart: <non-ai-id>`.
2. Decide which AI sub-pipeline:
   - alt-text / customElement / color-contrast-ai-v1 → `/accept_rules_data_percy` → `aiTypeCProcessingQueue` → `workerAI.js` or `jobAIColorContrast.js`
   - heading AI → `preProcessAIhtmlQueue` → `postProcessAIhtmlQueue` (B1-originated)
3. Webhook endpoint: `/ai/webhook`, `/ai/webhook/heading`, or `/ai/webhook/custom-elements` (all use `verifyBasicAuth`).
4. **AI state key discipline**:
   - `ai_${runId}` for Type C-originated AI (created in `controllers/getProxyMap.js:createAIrunIdMapping`).
   - `aihtml_${runId}` for B1-originated heading AI (created via Lua-atomic `setAIHtmlMetadataIfAIKeyEmpty` — mutually exclusive with `ai_${runId}`).
5. Both keys: `REDIS_TTL = 2 h`.

### New HTTP route

1. Add route file or extend `routes/<domain>Routes.js`.
2. **Pick one of the 4 auth middlewares** (`rules/api-design.md`). No new route without auth.
3. Controller in `controllers/`.
4. Validate body with Joi.
5. At every exit point: `markTaskCompleted(...)` before `sendResponse(...)` — prefer `sendResponse(payload, jobData, type, task, isComplete)`.

### New socket event

1. Add inside the existing `io.on('connection')` handler in `app.js`. New events inherit `verifySocketAuthToken`.
2. Non-trivial logic goes in `utils/<name>Handler.js`, not inline in `app.js`.
3. **Do NOT create a new `io.of(...)` namespace** without re-applying auth.

### Adding a BullMQ queue

1. Define in `utils/bullmq.js` with a typed `addJobTo<Name>Queue(job)` helper.
2. Bind in the owning process (`worker.js` for main, `aiWorker.js` for AI).
3. Add the worker to `setupWorkerShutdown(workers)` in the owning process file (`utils/workerShutdown.js`).

## Phase 5 — Test

| Sub-project        | Framework            | Run                               |
| ------------------ | -------------------- | --------------------------------- |
| `a11y-engine-core` | Karma + Mocha + Chai | `cd a11y-engine-core && npm test` |
| `dom-forge-core`   | Mocha                | `cd dom-forge-core && npm test`   |
| `ip-protection`    | Jest                 | `cd ip-protection && npm test`    |

Tests **MUST cover**: happy path, null/missing input state (empty DOM, missing scan context), and at least one error path. This is non-negotiable per project conventions.

## Phase 6 — Lint

```bash
npm run lint:modified       # auto-fix on changed files
npm run lint:check          # full check (must pass)
```

The pre-commit hook runs lint-staged automatically — don't skip it.

## Phase 7 — Review and PR

1. Self-review against `skills/stack:code-review.md`.
2. Commit with `<type>(<scope>): <subject>` (see `rules/commit-conventions.md`).
3. For `axe-core/` changes: every modified line carries `// [tag]: …` per `rules/commit-conventions.md`.
4. `gh pr create` — describe the lane (A/B1/C/AI), which version files were added, and any in-flight scan compatibility notes.

## Hard reminders (will fail review if violated)

- Never modify `combined-rules-class-vN.js`, `commons/v2/*-vN.js`, or `*-evaluate-vN.js` in place.
- Never call `queue.add(...)` directly — use the `addJobTo*Queue` helpers.
- Never put DOM, AI HTML, or asset bytes in a BullMQ job payload — Redis or S3, then pass the key.
- Never write a Redis key without a TTL.
- Never call `markTaskCompleted` and `sendResponse` separately — use the combined signature.
- Never add a new socket namespace without `io.use(verifySocketAuthToken)`.
- Never `console.log` (browser or server).
