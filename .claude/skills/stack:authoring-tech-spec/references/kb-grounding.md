# KB grounding + hard gates

Read the relevant rows before drafting the matching section, and verify the spec satisfies every hard
gate it touches. Paths are repo-relative: engine docs are in this repo (`.claude/knowledge/...` once
installed; `knowledge/...` in the harness). Accessibility-side docs live in the sibling `accessibility`
repo's stack (`stack-domain-accessibility/knowledge/...`) — read them when the change crosses the boundary.

## Engine KB → section grounding (beyond the 6 flow docs already cited)

| Spec section                                       | Ground in                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rollout & rollback                                 | `knowledge/DEPLOYMENT.md` — pre-deploy gate table + the **FluxCD→Argo canary** path for `ip-protection` (15-min pause; rollback = Argo abort / revert tag in `a11y-engine-infra-ops`); config-only ships via `release.yaml` + `increment_only` bump. Package path → `stack:publish-workflow` + `flows/release.md` (new core/dom-forge version = new S3 bundle URLs Percy consumes). |
| Kill switch & feature flags                        | `knowledge/FEATURE-FLAGS.md` — startup caches (rules/kill-switch/timeout), **no in-flight refresh (restart required)**, `isFeatureEnabledRedis` per-customer (treat as strict boolean — `'false'` is truthy), classification arrays.                                                                                                                                                |
| Error handling / boundaries / reporting; Debugging | `knowledge/docs/errors/ERROR-CATALOG.md` (map the new failure modes onto existing buckets) + `knowledge/learnings.md` (top prod-bug sources: silent empty success, flag truthiness, six-task kill pattern, shared-helper null checks).                                                                                                                                              |
| Metrics / Instrumentation                          | `knowledge/docs/flows/observability.md` — EDS envelope strictness (constants, case-sensitive `eventType`, top-level `api_key`; wrong case = silent drop), logger (cheap, 2-wk) vs `EDSUtils` (BigQuery; never per-element), Type C latency event set.                                                                                                                               |
| Data & contracts (endpoints/auth)                  | `knowledge/docs/flows/auth.md` — the 4 middlewares (`verifySocketAuthToken`/`verifyAPIAuthToken`/`verifyAutomationAuth`/`verifyBasicAuth`), JWT `PREVIOUS_JWT_TOKEN_SECRET` rotation, webhook two-key rotation. `rules/api-design.md` — `sendResponse(...)` signature, the retry policy on 5xx/429, Joi-validate every body.                                                        |
| Data & contracts; Versioning (AI lanes)            | `knowledge/docs/flows/ai-service.md` — per-flag **min-engine-version** matrix (older clients safe-skip), `ai_${runId}` vs `aihtml_${runId}` exclusivity, AI-unreachable = skip-and-consolidate (never block).                                                                                                                                                                       |
| Versioning, back-compat & governance               | `rules/database-migrations.md` — append-only `-vN+1` is a hard reviewer-block (three schemes: `combined-rules-class-vN`, `commons/v2/*-vN`, `*-evaluate-vN`).                                                                                                                                                                                                                       |
| Compliance & security                              | `rules/security.md` — IP-protection trust boundary (eval/scoring stays server-side), never forward `aiAuthToken`/`BASIC_*`/JWT to browser/Percy/socket, no `JSON.stringify` of secret objects, every Redis key has a TTL.                                                                                                                                                           |
| HLD/Components; Capacity                           | `rules/api-design.md` — new worker/queue onboarding triad (register in `setupWorkerShutdown`, add to `killSwitchClearance.js`, set `lockDuration` to measured staging p99); peak fan-out math (worker concurrency × PUTs per item — compute from current limits).                                                                                                                   |
| Cross-team dependencies                            | `knowledge/DEPENDENCIES.md` — external auth/config map (Percy token, AI `BASIC_AI_AUTHTOKEN` + rotating webhook secrets, WebA11y `BASIC_AUTHTOKEN`, regional hosts, Vault) + sibling coupling (`accessibility` `db/rules/a11y_engine_${VERSION}.json`, `frontend` toolkit bumps).                                                                                                   |

## Accessibility-side boundary grounding (when the change crosses into the product)

| Spec section                    | Ground in (in `stack-domain-accessibility`)                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data & contracts; Cross-team    | `knowledge/docs/services/a11y-engine.md` — engine↔WebA11y contract, **`X-Service-Auth` (s2s) on every callback**, `A11yEngineJob` model (`payload`/`status`/`report_id`/`test_id`/`result_type`), 1-hr SLA, **`/timeout` is the canonical SLA-breach signal**.                                                             |
| Data & contracts                | `knowledge/docs/services/ai-service.md` — names `POST /api/a11y_engine_jobs` (consumed by `A11yEngineJobsConcern`) + the **4-repo "Adding a New AI Rule"** coordinated-release checklist (misc-services + a11y-engine + accessibility + frontend).                                                                          |
| Assisted Test sections          | `knowledge/docs/diagrams/assisted-tests-flow.md` (wizard→engine validation→backend session-save→TestHub→MySQL) + `knowledge/docs/adrs/004-testhub-as-source-of-truth-via-dual-write.md` (`AssistiveReport` carries `testhub_build_uuid`; per-tenant flag gate).                                                             |
| Data & contracts (AT/TestHub)   | `knowledge/docs/services/testhub.md` + `skills/stack:testhub-integration` — AT entity map (`AssistiveReport`→Build, `Issue`→`AccessibilityIssue`); **TH UUIDs must propagate or downstream joins break (AP-05)**; SDK is auto-generated (never hand-edit; `/regenerate-testhub-sdk`).                                       |
| Data & contracts (compat)       | `knowledge/docs/flows/automated-tests-sdk-build.md` — **dual-EOF coordination** (Type B2 + B1/C markers); changing EOF/marker semantics is a breaking change on the consumer.                                                                                                                                               |
| Cross-team; Kill switch & flags | `knowledge/FEATURE-FLAGS.md` + `docs/adrs/003-redis-feature-flags-with-permissive-default.md` — flag naming `{product}_{feature}_access`, register in `01_pricing_and_features_constants.rb`/`FEATURE_PRODUCT_MAPPING`, cross-product `weba11y_rule_engine_*` / `weba11y_ai_rules` gates the engine must read consistently. |

## HARD GATES — verify the spec satisfies every one it touches

**Engine:**

- **Rollout honors `DEPLOYMENT.md`'s pre-deploy gate** (P0+P1 sanity, flag ON+OFF, mutation ON+OFF, shadow-DOM/cross-origin, Redis stress for queue changes, phase-by-phase stag→preprod→prod, no Friday prod; skip-QA = QA-lead approval, not "skip testing").
- **Append-only versioning** — new `-vN+1` sibling; editing an existing `-vN.js` is a review-block (in-flight scans replay their dispatched version).
- **Six-task kill-switch pattern** — any kill-switch-protected entry point marks all six `COMPLETION_TASK_TYPES.*`, else scans hang.
- **New worker/queue triad** — `setupWorkerShutdown` + `killSwitchClearance.js` + `lockDuration` = measured p99.
- **No silent empty success** — on failure, mark the completion task failed; never return `violations: []`.
- **IP-protection trust boundary** — eval/scoring/heuristics server-side only; no secrets forwarded to browser/Percy/socket.
- **Every Redis key has a TTL; BullMQ payloads carry IDs only.**
- **EDS envelope strictness** — events via constants (case-sensitive `eventType`, top-level `api_key`) or they silently drop.
- **AI flag back-compat** — new `a11yCoreConfig` flags pin a min-engine-version (safe no-op on older clients); AI-service unreachable = skip-and-consolidate.

**Accessibility boundary (when crossed):**

- **S2S auth (`X-Service-Auth`)** on every engine→accessibility callback.
- **`/timeout` emitted on SLA breach** — the consumer won't infer it from absence.
- **Dual-EOF preserved** — both B2 and B1/C EOF markers when advanced rules are on; dropping one hangs the build.
- **TestHub UUIDs propagate** (`testhub_build_uuid` / `testhub_btcer_uuid`) — missing = silent downstream-join breakage (AP-05).
- **Flag naming + registration aligned**; **camelCase + `api/internal/v1/`** for s2s routes/responses.
- **4-repo coordinated release** for a new AI rule; **TestHub SDK is auto-generated** (regenerate, never hand-edit).

## Cross-team feature contracts are grounded in CODE, not this KB (read first)

This KB maps **established** engine behavior to sections. It will **not** contain the engine contract for a
**brand-new cross-team product feature** (e.g. a dashboard feature where the engine only supplies data) —
that lives in the `a11y-engine` repo and the prior-phase PRs, not here, and the product brief is **not
authoritative** on the engine's slice. For such features: grep/git-log the real repo for the prior-phase
implementation, define the engine's piece as the **delta** over it, mark any brief-derived field
name/payload/endpoint `[verify]`, confirm an IN/OUT carve-out with the engineer, and **block** if you can't
establish the prior-phase engine contribution. See SKILL.md §1a.

## Contract gaps to CONFIRM with the accessibility team (don't assume)

- **Endpoint name:** docs disagree — `/scan-complete` + `/timeout` (a11y-engine.md, GLOSSARY) vs `POST /api/a11y_engine_jobs` (ai-service.md, pipelines). Confirm the exact route; mark `[verify]` in the spec.
- **`A11yEngineJob.result_type` enum values** are undocumented (Type A/B1/B2/C mapping unknown) — pin them in the spec.
- **AT session-save route** is unnamed in the KB — confirm the `assistive_reports` save endpoint.
