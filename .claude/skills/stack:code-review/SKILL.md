---
name: stack:code-review
description: Code review checklist for a11y-engine (Spectra). Lane-aware (Type A/B1/C/AI), enforces version-file append-only discipline, auth coverage, TTL discipline, browser-context performance, and observability hygiene.
---

# Skill: stack:code-review — Code Review

## When to invoke

Use this skill when the user asks to: review a PR, review a diff, or look over a change. Also: run this skill as the final pre-commit gate in `stack:feature-dev` Phase 7.

## Prerequisites

- Be able to read `git diff` or open the PR's changed files.
- Know which sub-project(s) the change touches — `a11y-engine-core`, `ip-protection`, `dom-forge-core`, `mini-percy-renderer`, or `axe-core`.

## Pre-flight

State up front:
- **Lanes touched** — A / B1 / B2 / C / AI / infra (workers, routes, sockets) / submodule.
- **Sub-projects touched.**
- **Risk vector** — does the change affect scan correctness, retry semantics, version compatibility for in-flight scans, or only inert paths (tests, docs, lint config)?

## Hard-fail checks (block the PR until fixed)

### Versioning discipline (see `rules/database-migrations.md`)

- [ ] No edits to an existing `worker/combined-rules-class-vN.js` — if rules added, a new `-v(N+1).js` extending the previous is added.
- [ ] No edits to an existing `commons/v2/*-vN.js` — bumped helpers add a `-v2` / `-v3` sibling.
- [ ] No edits to an existing `checks/combined-rules/*-evaluate-vN.js` — bumped evaluators add a new sibling.

### Auth (see `rules/api-design.md`, `rules/security.md`)

- [ ] Every new route in `routes/*.js` has one of `verifyAPIAuthToken`, `verifyAutomationAuth`, `verifyBasicAuth`.
- [ ] No new `io.of(...)` namespace without `io.use(verifySocketAuthToken)`.
- [ ] No hand-rolled JWT decoding — `verifyToken` / the 4 middlewares are the only path.

### Job payload discipline (see `rules/api-design.md`)

- [ ] No raw DOM, AI HTML, or asset bytes in any `addJobTo*Queue` payload.
- [ ] No direct `queue.add(...)` calls — typed helpers only.

### Redis TTL discipline (see `rules/security.md`)

- [ ] Every new Redis `set` / `hset` / `sadd` / `rpush` has an explicit `EX` / `PX` / `EXPIRE`.
- [ ] New TTL constants are added to `ip-protection/config/constants.js`, not hard-coded inline.

### Browser-context performance (see `rules/frontend-components.md`)

- [ ] No full-tree DOM walks (`document.querySelectorAll('*')`, recursive `childNodes` traversal of root).
- [ ] No nested DOM loops.
- [ ] No repeated `querySelectorAll` on the same scope inside a loop — cache it.
- [ ] No allocations in hot loops (`Array.from`, spread on already-iterable collections, throwaway closures).

### Observability (see `rules/frontend-components.md`, `knowledge/docs/flows/observability.md`)

- [ ] No `console.log` anywhere — browser code uses `EDSUtils.createEDSEvent(...)`, server uses `logger.log({kind, action, f0, f1})`.
- [ ] No raw tokens, auth headers, or PII in any log payload.
- [ ] Server logs prefer `logger.log` (2-week retention, low cost) over `new EDSUtils(...)` (high cost, requires justification).

### Exit-point completion (see `rules/api-design.md`)

- [ ] Every new exit point in `ip-protection` uses `sendResponse(payload, jobData, type, task, isComplete)` (preferred) or pairs `markTaskCompleted(...)` immediately before `sendResponse(...)`.
- [ ] Kill-switch paths mark **all six `COMPLETION_TASK_TYPES.*`** as done (see `controllers/buildProxyMap.js`).

### Submodule tagging (see `rules/commit-conventions.md`)

- [ ] If the diff touches `axe-core/`: every change carries `// [tag]: short description` with one of `a11y-critical`, `a11y-domforge`, `a11y-ip`, `a11y-core`, `a11y-rule-<name>`.
- [ ] No sensitive info in tag descriptions (axe-core is a public repo fork).
- [ ] No new Deque packages or imports.

## Lane-specific checks

### Type A / B1 changes (`a11y-engine-core`)

- [ ] Rule classified correctly in `lib/core/base/constants.js` (`TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`).
- [ ] Check evaluator handles null/missing DOM explicitly.
- [ ] Karma + Mocha + Chai test added; covers happy path, empty state, and an error path.

### Type C changes (`dom-forge-core`)

- [ ] Runner placed in `lib/core/runners/`, evaluator in `lib/checks/`.
- [ ] `dummySelector` not literally evaluated — real selector computed in the runner.
- [ ] If the change touches Percy invocation: `dom_forge_core_script_url` / `axe_script_url` still resolvable (these are S3 URLs from release flow).
- [ ] Mocha test added (`test/checks/`).

### Type C result handling (`ip-protection/worker/workerC.js`)

- [ ] `workerC.js` is **not** running rules — it's a sink.
- [ ] If the change adds a filter, it filters by stable rule id (`color-contrast-axe` is the canonical example).
- [ ] EDS latency emissions (`a11y_engine_scan`, `percy_exec_latency`, `a11y_api_latency`, `worker_latency`, `type_c_worker_wait_time`, `type_c_worker_queue_size`) preserved in the `finally` block.

### AI changes (`ip-protection/aiWorker.js`, `workerAI.js`, `jobAIColorContrast.js`, `workerPreProcessAIhtml.js`, `workerPostProcessAIhtml.js`, `workerCustomElementsAI.js`)

- [ ] AI rule JSON has `counterpart` pointing to the non-AI rule id.
- [ ] AI state key (`ai_${runId}` or `aihtml_${runId}`) discipline preserved — they are mutually exclusive per runId.
- [ ] Both AI state keys TTL'd at `REDIS_TTL` (2 h).
- [ ] Outbound AI calls use `Authorization: Basic <BASIC_AI_AUTHTOKEN>`. Webhook calls verify against rotating `BASIC_WEBHOOK_AUTHTOKEN_0` / `_1`.
- [ ] Heading-AI preprocess: HTML stored in S3 via 2 presigned URLs; the BullMQ job carries only IDs.

### Infra changes (queues, workers, routes, sockets)

- [ ] New queue defined in `utils/bullmq.js` with a typed helper.
- [ ] New queue bound in the right process (`worker.js` main vs `aiWorker.js` AI).
- [ ] New queue added to `setupWorkerShutdown(workers)` array.
- [ ] Lock duration appropriate — `QUEUES_LOCK_DURATION` (2 min) by default, `_EXTENDED` (5 min) for image processing, `_EXTENDED_15_MIN` for scan completion (B2).
- [ ] Retry / backoff configured if the job has external dependencies (e.g., `buildProxyMapQueue` has 6 attempts with exp backoff).

## Soft-fail checks (flag with `WARNING:` but don't block)

- Comment density — too much inline prose suggests the change is doing too many things.
- Magic numbers — should be in `config/constants.js` or `lib/core/base/constants.js`.
- Mixed concerns in a single file — controllers vs business logic should split.
- Missing JSDoc on new public functions in `utils/`.

## Reviewer questions to ask explicitly

Experienced reviewers on this team ask these every time. Ask them in the PR thread — answers go in the PR description, not the review comments.

1. **"What is the impact area? Which rules / ATs are affected?"** — every shared-helper change needs a consumer list.
2. **"Are P0 and P1 sanity reports run? Share the report URLs."**
3. **"Dev tested on which websites?"** — at minimum P0 sites plus one site in the affected domain.
4. **"Is this expected behavior with perception management ON and OFF?"** — for any rule output / tagging change.
5. **"Have you tested with feature flags both ON and OFF?"** — for any flag-gated change. The OFF default for new flags is the silent regression risk.
6. **"No impact on mutation scan mode — correct?"** — for any scan logic change.
7. **"List the test cases you ran."** — explicit case list makes QA review meaningful.
8. **"Is this skip-QA? If yes, who approved?"** — name the QA lead in the PR thread.
9. **"Have all Copilot / Claude review comments been addressed?"** — dismissed comments need an explicit response, not silence.
10. **"What's the null / undefined handling for the new edge cases?"** — especially when modifying a shared helper.

The above mirrors the team's existing review culture — when these questions are answered upfront in the PR description, review velocity goes up and the rate of post-merge issues goes down.

## Output format

```
Review: <PR title> (<Jira-ID>)
Lanes:  <A | B1 | B2 | C | AI | infra | submodule>
Sub-projects: <list>

CRITICAL (must fix):
  - <file:line> — <one-sentence issue, link to rule>
  ...

WARNINGS (should fix):
  - <file:line> — <one-sentence issue>
  ...

NOTES (consider):
  - <observation>
  ...

Verdict: <BLOCK | APPROVE-WITH-CHANGES | APPROVE>
```
