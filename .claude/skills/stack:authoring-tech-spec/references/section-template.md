# AllyEngine Tech Spec — Canonical Section Template

**This template is the single source of truth for spec structure.** Past engine specs vary cosmetically
(different opener headings, HLD sometimes nested); that variation is _descriptive of old specs_, not a
license to re-derive structure. Use the headings, order, and statuses below verbatim. Read example specs
(SKILL.md §1 explains how to find one) only to calibrate **depth and tone**, never to
choose sections.

## Doc-type scope (read first)

This template is for a **non-trivial feature / integration / architecture / migration tech spec** — a
real _design_ decision. It is NOT the right shape for:

- a **config/parameter reference** (e.g. "A11y Engine Configuration") — that's a living reference doc;
- a **PoC findings / feasibility** doc — use a lighter Problem → Findings → Recommendation shape;
- an **open-questions / revisit RFC** or a **challenges/blockers log**;
- a **CI / build-pipeline / packaging tooling change** (build-time tuning, `.npmrc`, npm-cache, bump-utility).

**Don't manufacture a spec for routine upkeep.** If the change has no new behavior, contract, lane, or
cross-repo coordination, it's below the spec threshold — say so and stop. See SKILL.md "Not for routine
upkeep" for the full list.

If the engineer's intent is any of the above, say so and don't force these sections on it.

## How section selection works (concern-triggered, not a change-type taxonomy)

Engine work doesn't fit a fixed list of change types — **each feature can be a new integration**. So
sections are chosen by **what the change actually touches**, not by slotting it into a named bucket. Each
section carries one status:

- `[SPINE]` — **always present, in the order below, with the exact heading.** Never rename, reorder, or
  drop one. Every engine spec has all 12.
- `[INCLUDE-IF: <trigger>]` — add the section **only when the change touches that concern.** Keyed on what
  the change does, so it adapts to novel integrations without a taxonomy to maintain.
- `[OPTIONAL]` — include only when specifically useful; otherwise omit (no "N/A" stub).

Don't pad. If a concern isn't touched, the section simply isn't there.

### Concern → section triggers

| Add this section                           | …if the change                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Versioning, back-compat & governance**   | touches rule classes (`combined-rules-class-vN`, `commons/v2/*`, `*-evaluate-vN`) or the engine version; an AI flag → also pin its **min-engine-version**                           |
| **Kill switch & feature flags**            | adds/changes a flag or an **enforcement gate** (quota/rate-limit → the enforce flag defaults **off**)                                                                               |
| **Error handling, boundaries & reporting** | introduces a new failure mode or lane that must stay contained, or changes rule provenance/attribution                                                                              |
| **Alerts & failure metrics**               | touches the uptime/SLO definition, alerting, or what to watch post-deploy                                                                                                           |
| **Capacity, latency & cost**               | adds a worker/pod, changes traffic/bandwidth/latency, or carries infra $ impact                                                                                                     |
| **HLD — Components / modules**             | spans multiple modules/repos — e.g. an **Assisted Test** (engine `assistedTests/` + extension wizard + Accessibility-Backend session-save + TestHub), or any cross-codebase feature |
| **HA & scaling**                           | needs failover / scale-strategy readiness (infra-heavy change)                                                                                                                      |
| **Compliance & security**                  | security **is** the change, or it adds secrets / data-retention / key-rotation surface                                                                                              |

### Emphasis triggers (shape a SPINE section, don't add one)

- **Moving rule logic between lanes / re-platforming** → HLD — Workflow frames **current → target** placement; QA / Testing **leads with behavior-parity** (old vs new equivalence over a URL set).
- **FP reduction / heuristic tweak** → QA **leads with FP/TP** validation vs an axe-core baseline; Metrics adds the **FP-rate** signal.
- **Quota / rate-limit / abuse (e.g. FUP)** → Rollout uses **observe-only → validate → enforce** staging.
- **AI lane / flag** → HLD — Data & contracts pins the AI sub-pipeline / ai-service contract + min-engine-version.
- **Assisted Test** → lanes A/B1/B2/C/AI are N/A (omit lane content); QA routes to `stack:a11y-qa` (see references/test-cases.md).

## Conventions (locked)

- **Title:** `<Feature> — Tech Spec`. No product/Jira prefix. (Spec-suffix variants like `… - Type <X> -
Tech Spec` are fine; the `— Tech Spec` suffix is required.)
- **Opener heading is `## Problem Statement`** — one canonical name. Do not use "What problem are we
  solving?" / "Overview" (corpus variants, now retired).
- **HLD is always top-level** (`## HLD — Workflow`, `## HLD — Data & contracts`), never nested under the
  solution section.
- **Requirements table** uses `Item | Requirement | Constraint`. Task Brief + Handover links live in/under
  this table.
- **Lead metadata** (Status/Author/Jira/Lanes) is a short lead block above Problem Statement, or Confluence
  page properties — either is fine.

Copy the block below into the local draft (`docs/tech-specs/<kebab-title>.md`). Keep every `[SPINE]`
section; add an `[INCLUDE-IF: …]` section only when its trigger fires.

---

```markdown
# <Feature Name> — Tech Spec

**Status:** Draft for review · **Author:** <name/squad> · **Jira:** <A11Y-/AXE-XXXX, if any>
**Lanes:** <A / B1 / B2 / C / AI — or "N/A (Assisted Test)"> · **Affected sub-projects:** `<a11y-engine-core | ip-protection | dom-forge-core | axe-core | scripts>`

## Problem Statement [SPINE]

<One–two paragraphs: the engine capability being added/changed, which lane(s), why now.>

## Requirements & Constraints [SPINE]

<Item | Requirement | Constraint table. Link Task Briefs + Handover docs here. "Out of scope" may be a row.>

## Solution — options & chosen approach [SPINE]

<Options with trade-offs (perf, cost, infra, dev-bandwidth): webhook vs SSE/long-poll; Redis vs RDS vs
Kafka; client-side vs IP-protected placement. Then the chosen approach + why.>

## HLD — Workflow [SPINE]

<Numbered end-to-end steps (diagram welcome): socket transmit → AllyEngine store (ElastiCache, keyed by
scopeKey) → scan-complete → BullMQ enqueue → worker process → result webhook to WebA11y. Note
part-of-page / full-page / mutation behavior.
Moving logic between lanes → frame as **current placement → target placement** and name what is
replicated exactly vs intentionally changed.>

## HLD — Components / modules [INCLUDE-IF: spans multiple modules/repos]

<Inventory of moving parts touched and their responsibilities. For Assisted Tests this MUST span:
ip-protection/assistedTests/<category>/ versioned classes + views/messages, the frontend extension
codebase (accessibility toolkit, apps/accessibility-toolkit; start-AT flow), the Accessibility Backend
session-save, and TestHub build/result sync.>

## HLD — Data & contracts [SPINE]

<Pin precisely — the heart of an engine spec:

- a11yEngine.run config: axeCoreConfig + a11yCoreConfig flags + metadata.product/productMetadata/edsConfig
  — only the fields this change touches. Full field list in engine-checklist §2.
- Storage schema: ElastiCache keys (ScopeKey@<rule-id>) + value JSON + TTL; S3 object layout; CSV/sheet
  columns — whichever apply.
- Endpoints / interfaces: AllyEngine scan-complete (e.g. POST /scan-complete, JWT); result→WebA11y
  (POST /api/a11y_engine_jobs, Basic auth, batched, EOF flag, result JSON);
  AND in-process JS contracts where relevant (handler signatures, wrapper.run()/configure(), class methods).
  Mark "[to be implemented by Web A11y]" on cross-boundary parts.
- AI integration → also pin the AI sub-pipeline / ai-service contract (min-engine-version per flag).
- Assisted Test → also pin extension-wizard messages, session-save payload, TestHub UUID propagation.>

## Versioning, back-compat & governance [INCLUDE-IF: touches rule classes or engine version]

<Append-only combined-rules-class-vN so in-flight older-version scans keep working; which engine version
gates the behavior; safe no-op for older deployed clients; release cadence + who triggers an axe-core
base / WCAG-revision upgrade. AI flags pin a min-engine-version. Re-platforming → append-only at the target.>

## Kill switch & feature flags [INCLUDE-IF: adds/changes a flag or enforcement gate]

<Rule-level and engine-level kill switch behavior (e.g. disableA11yEngineConfig, isKillSwitchActive),
feature toggles (enableEDSBatching, …): what each gates and the default when absent.
Quota/rate-limit → the enforce flag defaults OFF (observe-only) until explicitly flipped.>

## Error handling, boundaries & reporting [INCLUDE-IF: new failure mode / lane containment]

<Graceful degradation so a rule failure can't break the core scan; error boundaries around new lanes;
rule provenance (axe-core vs a11y-engine attribution); customer-side error logging / diagnostics; the
exception taxonomy if extending it.>

## Metrics / Instrumentation [SPINE]

<New/changed EDS event kinds (SCAN_RUN, ADVANCE_SCAN_RUN_WORKER, …) + filter fields; latency split
(rule-exec vs queue vs processing vs webhook); Looker L0/L1/L2 dashboard filters to add.
FP-reduction change → add the FP-rate signal.>

## Alerts & failure metrics [INCLUDE-IF: touches uptime/SLO or alerting]

<Uptime-definition impact (exclusion flags), error buckets, alert suppression where needed, what to watch
post-deploy (cross-link stack:a11y-metrics, stack:debug-alert, stack:ops-autopsy).>

## Capacity, latency & cost [INCLUDE-IF: adds worker/pod or changes traffic/latency/$]

<Traffic / bandwidth / download-volume estimates; latency/wait-time estimates; ElastiCache sizing ($/mo +
headroom), worker-pod additions per env (rcpu/rmem math), S3/CDN deltas; justify infra choice.
Quota/rate-limit → limit math, bucket/window sizing.>

## QA / Testing [SPINE — see references/test-cases.md]

<Common org guideline: designed cases via stack:test-case-designer (Assisted Test → stack:a11y-qa) → TCM
link + TRA quality-gate, PLUS engine modalities (FP/TP vs axe-core baseline over a URL set, saved-state
automation harness, config-flag permutations, unit happy/empty/error triad per package).
FP-reduction → LEAD with FP/TP validation. Re-platforming → LEAD with **behavior-parity** (old-lane vs
new-lane equivalence over a URL set; same FP/TP modality). Skip path (only when no new tests warranted +
existing automation covers it): state it explicitly and name the covering TCM suite / TRA build + a
one-line justification. Never leave empty or "N/A".>

## Rollout & rollback [SPINE]

<Enable mechanism (config flag flip by WebA11y / engine bump via bumpA11yEngine.sh), staged rollout, exact
rollback step, plus any operational runbook / data-load / packaging-distribution (NPM vs registry) steps.
Quota/rate-limit/abuse change → stage as **observe-only / simulate → validate thresholds vs real traffic
→ flip to enforce**; the enforce flag defaults off.>

## Cross-team dependencies & contract ownership [SPINE]

<Per-team change/responsibility matrix: what AllyEngine owns vs what WebA11y (and Percy/AI service/etc.)
must implement. The "Requirements/Blockers on Accessibility Team" table is idiomatic here.>

## Out of scope / known limitations [SPINE]

## Open questions / decisions [OPTIONAL]

<Open-issues tracker (question — owner — due) and/or dated decision-sync notes.>

## Effort estimates [OPTIONAL]

<Dev-days breakdown (a11y-engine / WebA11y / FE) — Category | Component | Dev Days.>

## HA & scaling [INCLUDE-IF: failover/scale readiness] · ## Debugging [OPTIONAL]

<Operational readiness: failover, scale strategy; runbook for inspecting/reproducing (link stack:debug-fp).>

## Compliance & security [INCLUDE-IF: security is the change / secrets / retention]

<GDPR/GRR/data-retention/key-rotation; secret keys added; security review needed.>

## Reviewers & approvals [SPINE]

| Reviewer | Role             | Status  |
| -------- | ---------------- | ------- |
| <name>   | Engine           | Pending |
| <name>   | WebA11y contract | Pending |
| <name>   | QA               | Pending |

## Links / references [SPINE]
```
