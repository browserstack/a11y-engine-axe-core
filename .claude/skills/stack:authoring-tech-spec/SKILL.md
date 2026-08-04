---
name: stack:authoring-tech-spec
description: "Author an AllyEngine (Spectra) platform Tech Spec as a Confluence page under 'Ally Engine Tech Specs' (pageId 4162814707, space ENG). AllyEngine is the rule-execution PLATFORM — NOT the user-facing accessibility product. Drafts locally from the engine's canonical section shape (problem → requirements → HLD → metrics → cost → QA → rollout), MANDATORILY includes a QA/Testing section per the common org guideline (cases via stack:test-case-designer → TCM + TRA), then publishes on confirmation. Assumes the Task Brief exists. Triggers: 'write a tech spec', 'author engine tech spec', 'draft tech spec for <feature>', 'allyengine tech spec', 'spectra tech spec'."
argument-hint: '<feature title> [<A11Y-XXXX | AXE-XXXX>]'
allowed-tools:
  [
    Read,
    Write,
    Edit,
    Glob,
    Grep,
    Bash(git:*),
    mcp__claude_ai_Atlassian_Rovo__search,
    mcp__claude_ai_Atlassian_Rovo__getJiraIssue,
    mcp__claude_ai_Atlassian_Rovo__getConfluencePage,
    mcp__claude_ai_Atlassian_Rovo__getConfluencePageDescendants,
    mcp__claude_ai_Atlassian_Rovo__createConfluencePage
  ]
---

<!-- Inherits from stack-org: coding-guidelines, security-rules -->

# stack:authoring-tech-spec — Author an AllyEngine (Spectra) Tech Spec

Scaffolds and publishes a **Tech Spec for the AllyEngine platform** (the `a11y-engine` / Spectra
monorepo) as a Confluence page under **"Ally Engine Tech Specs"** (`pageId 4162814707`, space `ENG`).
The tech spec is the _implementation contract_ for an engine-side change — once reviewed,
implementation just executes it.

**AllyEngine is the platform, not the product.** It runs the rule lanes (Type A / B1 / B2 / C / AI),
forks axe-core, captures DOM via DOMForge/Percy, versions rule classes append-only, and exposes a
config contract (`a11yEngine.run(...)`) plus a result contract to the **WebA11y backend** (the sibling
`accessibility` repo). Product-facing surfaces (Dashboard, Workflow Analyzer, Website Scanner,
Automated Tests UI) belong to the **accessibility** team, which _consumes_ the engine. This skill
authors **engine-platform** specs only.

**Exception — Assisted Tests (AT):** the engine team _owns the AT feature end-to-end_, and it legitimately
**spans the accessibility codebase** — AT code is in `ip-protection/assistedTests/`, but the feature also
touches the **frontend extension codebase** (the accessibility toolkit, `apps/accessibility-toolkit` in the
frontend repo — local checkout path varies per setup, so treat it as a concept, not a fixed path), the
Accessibility Backend (session-save), and TestHub.
AT specs therefore DO include those cross-codebase touchpoints; this is the one case where an engine spec
crosses into the product codebase, and its QA routes to the accessibility suite (see §4).

## When to use

After intake/alignment and (if applicable) once the approach is agreed — before implementation. For
any non-trivial engine change: a new rule lane / lane behavior, async result delivery, the
`a11yEngine.run` config contract, DOMForge/Percy capture, versioning, a new worker, latency/perf work, a
rule migration (lane → AT), or a quota/rate-limit (FUP) feature.

**Not for routine upkeep.** Config-value flips, alert/replica/PDB tuning, Redis-param or failover fixes,
endpoint-host repoints, dep/CVE bumps, CI/`.npmrc`/build tweaks, single-file bug fixes ship on the ticket

- PR alone — no spec. If there's no new behavior, contract, lane, or cross-repo coordination, it's below
  the spec threshold.

**Boundary — hand off, don't widen:**

| Need                                                             | Where                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Author this engine-platform Tech Spec (Confluence)               | **this skill** → parent `4162814707`                                               |
| A spec for how the _accessibility product_ integrates the engine | accessibility team's `stack:write-prd` → "Accessibility Tech specs" (`4077584449`) |
| Design the QA/functional test cases this spec must carry         | `stack:test-case-designer` (BStackAutomation) — see §4                             |
| Validate a rule's false-positive/true-positive behavior          | `stack:debug-fp` (this stack)                                                      |
| Add the rule/worker the spec describes                           | `stack:add-rule`, `stack:feature-dev`                                              |
| Scaffold a new/modified Assisted Test                            | `stack:add-assisted-test` (this stack) → `ip-protection/assistedTests/`            |
| Design AT test cases / automation                                | `stack:a11y-qa` → automation in `BStackAutomation/a11y/` (see §4)                  |

## Inputs (ask the engineer)

1. **Feature title** — human-readable; becomes the page title (engine convention: `<Feature> — Tech Spec`).
2. **Change type** — drives the HLD focus AND the QA routing (see §4). One of:
   - **New rule** (Type A/B1/B2/C/AI) · **Rule improvement via AI integration** · **Heuristic update**
     (e.g. FP reduction) · **Platform/infra** (versioning, DOMForge, latency, contracts) · **Rule
     migration / re-platforming** (lane → AT; parity-validated) · **Quota / rate-limit / abuse control**
     (FUP; observe→enforce) → engine-suite QA.
   - **Assisted Test (new/modified)** — a semi-automated WCAG check; **cross-codebase**: code in
     `ip-protection/assistedTests/<category>/` (scaffold via `stack:add-assisted-test`) + the frontend
     extension codebase (accessibility toolkit) + Accessibility Backend session-save + TestHub → **accessibility-suite QA**.
3. **Jira key** — `A11Y-XXXX` / `AXE-XXXX` if one exists (optional; engine specs reference it but don't prefix the title with it).
4. **Task Brief + Handover docs** — Confluence links from Product / rule-research. The engine spec links
   these in the Requirements table. If no brief exists, confirm this is engine-internal work.
5. **Scan lanes in scope** (for rule work) — Type A (axe-core, in-page) / B1 (ip-protection worker) / B2
   (cross-page aggregation) / C (DOMForge on Percy) / AI (sub-pipelines). Drives the HLD.
6. **Affected sub-projects** — `a11y-engine-core`, `ip-protection` (incl. `assistedTests/` for AT),
   `dom-forge-core`, `axe-core` (fork); for AT also the frontend accessibility toolkit (extension) / accessibility backend / TestHub.

## Procedure

### 1. Read context

- Read the Task Brief / Handover docs (Atlassian `getConfluencePage`) and the Jira issue (`getJiraIssue`).
- Structure comes **solely** from [`references/section-template.md`](references/section-template.md) — do
  not derive it from examples; the template's per-section guidance also sets the expected depth, so a prior
  read is **not required** to get the shape right.
- **Optional depth/tone calibration:** if unsure how much detail the team expects (first spec, or an
  unfamiliar lane), run `getConfluencePageDescendants` on `4162814707`, open a recent spec of the **same
  lane/type**, and skim it for house depth and voice. Skip it if you already know the style.
- Ground every concrete claim in this repo's flow docs — **do not fabricate** worker names, config keys,
  EDS kinds, version numbers, or endpoints. **The KB docs are the navigation map and starting point; the
  code is the source of truth.** If the KB and the code disagree, the code wins — use the value from code
  and flag the drift (it's a KB-refresh trigger for `stack:refresh-architecture`). The docs:
  `.claude/knowledge/docs/flows/` — `scan-lifecycle.md`, `rule-types.md`, `socket-protocol.md`,
  `versioning.md`, `workers.md`, `storage.md`; plus `knowledge/{PRODUCT,GLOSSARY,TESTING,PERFORMANCE}.md`.
- **Section-specific grounding + hard gates:** use [`references/kb-grounding.md`](references/kb-grounding.md)
  — it maps each spec section to the KB docs it depends on (DEPLOYMENT, FEATURE-FLAGS, ERROR-CATALOG,
  observability, ai-service, auth, learnings, `rules/*`, DEPENDENCIES, and the accessibility-side
  contract/AT/TestHub/flag docs) and lists the **hard gates** the spec must satisfy. Read the relevant rows
  before drafting each section.

### 1a. Combined / cross-team feature? Ground the engine's slice first (don't trust the brief)

Many engine changes are **one team's part of a feature owned across teams** (engine + WebA11y backend +
dashboard frontend + extension). When the Task Brief is a product/PM brief (lives in a product space; talks
about UI, Q&A, dashboards, funnels, visual rendering; names other teams/repos), treat it as describing the
**whole feature, not your slice** — it is **NOT authoritative on what the engine builds**. Inferring the
engine's contract from a product brief is the single biggest way this skill can steer an author wrong.

Before drafting, you MUST:

1. **Detect it.** Cross-team signals: brief in a product space, mentions of dashboard/UI/visual
   helpers/funnel, other teams' repos.
2. **Ground the engine's slice in CODE, not the brief or KB.** The engine KB and past specs will NOT
   contain a brand-new cross-team product feature's engine contract. Open the actual `a11y-engine` repo and
   find the prior-phase implementation — grep / git-log for the payload, endpoint, evaluator, or rule files
   the brief names. For a multi-phase feature, the engine's Phase-N piece is the **delta** over what the
   engine already shipped in Phase N-1 — establish that first.
3. **Produce an explicit IN (engine) / OUT (other teams) carve-out table and have the engineer confirm it**
   before writing the body. Do not assume the boundary.
4. **Mark every contract detail taken from the brief `[verify]`** (field names, payload shapes, endpoints)
   and confirm against engine code — never assert product-brief facts as engine truth.

**HARD BLOCK:** if it is a cross-team feature AND you cannot establish the engine's prior-phase contribution
(no repo access, no prior-phase PRs, no engine handoff doc), **do not draft a confident spec.** Stop and
tell the engineer to pull the Phase N-1 engine PRs / the engine handoff doc / pair with the engine owner,
then resume. A confident-but-wrong spec is worse than no spec.

### 2. Draft locally first

- Load the canonical engine section shape: [`references/section-template.md`](references/section-template.md).
  It defines a **lean fixed spine** (always present, fixed order, exact headings) plus
  **concern-triggered sections** — you add a section only when the change _touches that concern_
  (touches rule classes → Versioning; adds a flag/enforcement → Kill switch; adds a worker/pod → Capacity;
  …). Section selection keys off what the change does, not a named change-type, so it adapts to novel
  integrations. Don't pad: an untouched concern means the section simply isn't there.
- Walk the engineer through the engine decision points before drafting:
  [`references/engine-checklist.md`](references/engine-checklist.md) (lane classification, the
  `axeCoreConfig`/`a11yCoreConfig` contract, scope-key/productMetadata, scan-complete + result endpoints
  with batching/EOF, EDS event kinds + Looker L0/L1/L2, append-only versioning, DOMForge/Percy + proxy map).
- Write the draft to `docs/tech-specs/<kebab-title>.md` in the repo (local, reviewable). Surface the
  proposed title + section outline to the engineer **before** filling the body.
- Fill every `[SPINE]` section. Add an `[INCLUDE-IF: …]` section only when its trigger fires (the change
  touches that concern); if it doesn't, omit the section entirely — no "N/A" stub. `[OPTIONAL]` sections:
  include only when useful. Never leave an empty heading.

### 3. Title

`<Feature Name> — Tech Spec`, no product/Jira prefix; Status / Author / Jira / Task Brief / Handover go in
the lead block + Requirements table. See section-template "Conventions" for the locked rules.

### 4. QA / Testing — MANDATORY (common org guideline)

The spec **cannot be finalized without a QA / Testing section** — a blank or "N/A" section is never
acceptable. It follows the **common test-case guideline used across teams** (not an engine-only variant);
follow [`references/test-cases.md`](references/test-cases.md) for the full flow. The essentials:

- **Route by change type FIRST (the key guardrail):** Assisted Test work → design via **`stack:a11y-qa`**,
  automation in **`BStackAutomation/a11y/`**. All other engine work → design via
  **`stack:test-case-designer`**, coverage baseline **`BStackAutomation/a11y_engine/`** + in-repo unit suites.
- **The designer skills live in another stack:** if available in this session, invoke it with the Jira key
  - this spec; if not (engine-only session), **block** and have the engineer run it at the workspace root
    and paste back the cases — don't hand-author the table.
- **Document the designed cases in the spec** (17-column table, embedded or linked) plus the planned test
  dimensions. A TCM link / green TRA build are downstream follow-ups, not finalization gates — they're
  required only on the documented-skip path, as evidence existing automation suffices.

See `references/test-cases.md` for coverage-context steps, the exact dimensions, and the skip-path rules.

### 5. Review, then publish on confirm

- **Before showing the draft, verify it satisfies every applicable hard gate** in the "HARD GATES" section
  of [`references/kb-grounding.md`](references/kb-grounding.md), and that any `[verify]` contract gaps are
  flagged for the accessibility team.
- Show the complete local draft + target (`parentPageId 4162814707`, space `ENG`, `cloudId
browserstack.atlassian.net`). **Wait for explicit confirmation.**
- On confirm, create the page via `createConfluencePage` (markdown content, parent `4162814707`).
- Report the page URL; optionally add it to the Jira issue. Leave the local draft in place (delete after
  publishing if the team prefers Confluence-only).

## Self-healing

- **No Task Brief / Handover doc:** confirm whether this is genuinely engine-internal or whether Product
  owes a brief first. Don't invent product rationale.
- **Task Brief is a cross-team product brief:** it describes the _whole_ feature, not the engine's slice —
  follow §1a. This is the highest-risk failure mode for a less-experienced author; make the uncertainty
  loud and never paper over it.
- **Tempted to add product-surface sections** (Dashboard/WA/WS/AT UI): stop — those are the accessibility
  team's domain. Capture only the engine's _contract_ to WebA11y, not the product's rendering.
- **Unsure which lane / worker / config key / EDS kind applies:** read `knowledge/docs/flows/` and
  `PRODUCT.md`/`GLOSSARY.md` before asserting; mark anything unverifiable with `[verify]`.
- **QA edge cases (skip path, designer not installed, AT routing):** all covered in §4 + `references/test-cases.md`.
- **AT spec missing a cross-codebase touchpoint:** AT spans engine (`ip-protection/assistedTests/`) +
  extension wizard + Accessibility Backend session-save + TestHub. An AT spec that omits any of these is incomplete.
- **Intent is not a feature/integration/architecture spec:** this skill models that doc type only. A
  **config/parameter reference**, **PoC findings/feasibility**, **open-questions/revisit RFC**, or
  **challenges/blockers log** is a different shape — say so and don't force the template's sections on it.

## Boundaries

Tech-spec drafting is draft-class work: this skill completes the scaffold and publishes on the
engineer's confirmation, but the named reviewers (per the AllyEngine review process) must approve before
the spec is treated as the implementation contract.

## References

- Section template (engine shape): [`references/section-template.md`](references/section-template.md)
- Engine decision checklist: [`references/engine-checklist.md`](references/engine-checklist.md)
- KB grounding + hard gates (per-section docs to read, gates to satisfy): [`references/kb-grounding.md`](references/kb-grounding.md)
- QA/test-cases gate + handoff (common TCM/TRA guideline): [`references/test-cases.md`](references/test-cases.md)
- Confluence parent — "Ally Engine Tech Specs": `pageId 4162814707` (space `ENG`)
- Engine flow docs: `.claude/knowledge/docs/flows/{scan-lifecycle,rule-types,versioning,socket-protocol,workers,storage}.md`; `knowledge/{PRODUCT,GLOSSARY,TESTING,PERFORMANCE}.md`
- Related skills: `stack:test-case-designer` (functional cases → TCM), `stack:tra-reports` (TRA results), `stack:debug-fp` (FP/TP), `stack:add-rule`, `stack:feature-dev`, `stack:a11y-metrics`, `stack:ops-autopsy`
