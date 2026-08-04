# AllyEngine Tech Spec — Engine Decision Checklist

Walk the engineer through these **before drafting the body**. Each maps to template sections. Ground every
answer in the KB (`.claude/knowledge/docs/flows/`, `knowledge/PRODUCT.md`) **as the map, then confirm
against code — code is the source of truth and wins on any disagreement.** Never invent worker names,
config keys, EDS kinds, endpoints, or version numbers.

For the per-section KB docs each decision depends on **and the hard gates the spec must satisfy**, see
[`kb-grounding.md`](kb-grounding.md) — read its rows alongside these prompts.

## 0. Scope & routing (decide FIRST — drives HLD focus + QA routing)

Answer the two pre-checks, then route QA. **Section selection is NOT decided here** — it is
concern-triggered per [`section-template.md`](section-template.md) (lean spine + add a section when the
change touches that concern). What you settle here is the HLD focus and which QA pipeline runs the cases.

**Pre-check — is this even spec-worthy?** If there's no new behavior, contract, lane, or cross-repo
coordination, it's below the spec threshold — say so and stop, don't manufacture a spec. See SKILL.md
"Not for routine upkeep" for the list of what ships on ticket + PR alone.

**Also pre-check — combined / cross-team feature?** If the brief spans teams or reads like a product/PM
brief, the engine owns only a **slice** and the brief is **NOT authoritative** on it. This is the top way
the skill can steer an author wrong — follow SKILL.md §1a in full (ground in repo code, confirm an IN/OUT
carve-out, mark brief-derived details `[verify]`, block if you can't establish the prior-phase contribution).

**QA routing fork** (the one fork that matters here):

- **Assisted Test (new/modified)** → see §0a; QA via `stack:a11y-qa` + `BStackAutomation/a11y/`.
- **Everything else** (new rule, AI integration, FP/heuristic tweak, platform, lane re-platforming,
  quota/rate-limit, …) → work through §1–§13 below; QA via `stack:test-case-designer` +
  `BStackAutomation/a11y_engine/`. Let HLD focus follow what the change touches (lanes, config contract,
  AI sub-pipeline, enforcement gate, …) — and let those same touch-points trigger the optional sections.

## 0a. Assisted Test specifics (only if change type = AT)

AT is cross-codebase and engine-owned. The durable structure to cover — capture each touchpoint:

- **Engine code:** `ip-protection/assistedTests/` — versioned, append-only classes; scaffold via
  `stack:add-assisted-test` (it owns the current categories + class/view/message conventions).
- **Frontend extension** (accessibility toolkit, `apps/accessibility-toolkit`): the interactive wizard steps + the start-AT socket flow.
- **Accessibility Backend:** session-payload save. **TestHub:** build create + TH-UUID storage.
- **QA:** design via `stack:a11y-qa`; automation in `BStackAutomation/a11y/` (existing AT cases live there).
- (Lane classification §1 below is N/A for AT — skip it.)

## 1. Lane classification → "What problem", HLD/Workflow

Which lane(s)? Taxonomy is **worker-based, not JSON-location-based** — read `flows/rule-types.md` for the
current dispatch map (workers, queues, files). The conceptual shape to anchor on:

| Lane   | Runs where                                                                                    | Async trigger                                                                    |
| ------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A**  | Browser (extension / SDK), in-page                                                            | Synchronous; inlined into scan response                                          |
| **B1** | `ip-protection` main worker                                                                   | EOF on B1 DOM-chunks stream                                                      |
| **B2** | `ip-protection` main worker                                                                   | Aggregation across all B1 results (cross-page)                                   |
| **C**  | `dom-forge-core` on **Percy** infra (NOT `ip-protection` — `workerC` is only the result sink) | After Percy capture                                                              |
| **AI** | `ip-protection` AI worker process(es)                                                         | Candidates from DOMForge (Type-C-origin) or B1 (heading); multiple sub-pipelines |

## 2. Config contract (`a11yEngine.run`) → HLD/API contract

If the change alters invocation/config, pin the fields you touch precisely — **read the live config
schema** for the current set (the `axeCoreConfig` / `a11yCoreConfig` / `metadata` shape at the run entry
point); don't rely on a remembered flag list, new flags land often. Capture:

- the `axeCoreConfig` / `a11yCoreConfig` flags this change reads or sets, and the `metadata`
  (`product`, `productMetadata`, `edsConfig`) fields it depends on;
- for any new flag: who sets it (usually WebA11y) and the safe default when absent.

## 3. Scope key & result→scan mapping → HLD

- Scope key is the unit of result aggregation — read the scope-key helper (`flows/scan-lifecycle.md`
  documents its composition; e.g. `getScopeKey()`) and confirm how violations stitch back via `productMetadata`.
- Completion-tracking Redis keys + kill-switch short-circuit — confirm the key shape in `flows/storage.md` / code.

## 4. Endpoints & delivery → HLD/API contract

- The engine↔WebA11y contract (scan-completion endpoint + result/report delivery, auth, batching, EOF flag,
  result-JSON shape) lives in `flows/ai-service.md` / `rules/api-design.md` and the sibling `accessibility`
  stack — read those for the current routes, auth scheme, and batch size; read `sendResponse(...)` for the
  live payload shape. Mark `[to be implemented by Web A11y]` on cross-boundary parts.
- Delivery mechanism trade-off (webhook vs SSE/long-poll) if relevant → "Possible solution(s)".

## 5. Storage / EOF → HLD/Redis schema

- ElastiCache key conventions, value JSON, **TTL** (every key must have one), Multi-AZ failover — read
  `flows/storage.md` for current key shapes and TTLs.
- EOF markers in Redis (`flows/storage.md`, `GLOSSARY` EOF): which chunked streams gain/change an EOF gate.
- Proxy map for Type C Percy rendering — note dependency if touched (see `flows/dom-capture.md`).

## 6. Versioning & back-compat → Versioning, Rollout

- Append-only `combined-rules-class-vN` so in-flight older-version scans keep working (`flows/versioning.md`).
- Which engine version gates the behavior; how older deployed clients behave (must be a safe no-op).
- Version-file discipline is **append-only** — call it out in Rollout.

## 7. Observability → Metrics, Alerts

- New/changed EDS event kinds (e.g. `SCAN_RUN`) and filter fields — read `flows/observability.md` for the
  current event set + EDS envelope rules.
- Latency split: rule-execution vs queue vs processing vs webhook.
- Looker L0/L1/L2 dashboard filters to add (cross-link `stack:a11y-metrics`); uptime exclusion if needed.

## 8. Capacity & cost → Capacity, latency & cost

- Traffic / bandwidth / download-volume estimates; latency / wait-time estimates per lane.
- ElastiCache sizing ($/mo, headroom vs estimated GB), worker-pod additions per env with rcpu/rmem math,
  S3/CDN deltas. Justify infra choice (Redis vs RDS vs Kafka).

## 9. Kill switch & feature flags → Kill switch & feature flags

- Does the change interact with the rule-level / engine-level kill switch (`isKillSwitchActive`,
  `disableA11yEngineConfig`)? What does it gate, and the default when the flag is absent?
- New feature toggles (e.g. `enableEDSBatching`) and their off-behavior.

## 10. Error handling, boundaries & reporting → Error handling section

- How does a failure in the new lane/rule stay contained so it can't break the core scan (error boundary)?
- Rule provenance: can a failed check be attributed to axe-core vs a11y-engine? (recurring engine concern)
- Customer-side error logging / diagnostics; any extension of the exception taxonomy.

## 11. Versioning governance → Versioning, back-compat & governance

- Beyond the append-only scheme (§6 was back-compat): release cadence, and **who triggers** an axe-core
  base upgrade or a WCAG-revision bump. Cross-team ownership of the version trigger.

## 12. Cross-team contract ownership → Cross-team dependencies

- Build the per-team change/responsibility matrix: what AllyEngine owns vs what **WebA11y** must implement
  (the result-handshake on `/api/a11y_engine_jobs`), plus Percy / AI-service / datawarehousing touch points.
- This is idiomatic as a "Requirements/Blockers on Accessibility Team" table — every engine change hands off.

## 13. Compliance, approvals & reviewers → Compliance & security / Reviewers

- GDPR/GRR/data-retention/key-rotation; new secret keys; security review needed?
- Name reviewers (Engine / WebA11y-contract / QA) — polished engine specs carry a Reviewers & approvals table.
