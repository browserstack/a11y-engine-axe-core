# QA / Testing — Mandatory (Common TCM + TRA Guideline)

The tech spec **is not final without a populated QA / Testing section**. AllyEngine follows the **same
common test-case guideline as other teams** — designed cases live in BrowserStack Test Management (TCM)
and automated execution is tracked in TRA (Test Reporting & Analytics). Do not invent an engine-only
variant.

## Route by change type FIRST (the key guardrail)

The design skill AND the suite differ by what the spec changes:

| Change type | Design skill | Automation + coverage suite |
|---|---|---|
| **Assisted Test** (new/modified) | **`stack:a11y-qa`** (export route → TCM/CSV) | **`BStackAutomation/a11y/`** — existing AT cases live here (+ `stack:a11y-qa` `FEATURE_CATALOG.md`) |
| New rule / AI integration / heuristic / platform | **`stack:test-case-designer`** | **`BStackAutomation/a11y_engine/`** + engine in-repo unit suites |

AT is cross-codebase (engine `ip-protection/assistedTests/` + extension wizard + Accessibility Backend +
TestHub), so its automation deliberately lives in the **accessibility** suite, not the engine suite. Do not
mix them up. Everything below (coverage context, gate, skip path, TCM/TRA) applies to **both** routes —
only the design skill and suite swap.

## Step 0 — Build coverage context (do this BEFORE designing)

New cases must be the **delta for coverage**, not a redesign. Before invoking the designer, establish two
things so the output is deduped against what already exists and grounded in how the feature changes the flow:

1. **Feature-impact context (engine KB).** Read the engine knowledge base to understand how the new
   feature touches the overall scan flow: `.claude/knowledge/docs/flows/` (`scan-lifecycle`, `rule-types`,
   `socket-protocol`, `versioning`, `workers`, `storage`) + `knowledge/{PRODUCT,GLOSSARY,TESTING}.md`.
   Identify which lanes, workers, contracts, flags, and downstream consumers the change moves.
2. **Existing coverage baseline — the AllyEngine automation suite.** Inventory what is *already* tested so
   you don't duplicate it and can spot the gaps. The engine team's own automation suite lives at
   **`BStackAutomation/a11y_engine/`** (github.com/browserstack/BStackAutomation, `master` branch) — this
   is the engine-owned suite; do **NOT** use `BStackAutomation/a11y/` or `stack-domain-BStackAutomation-a11y`,
   which belong to the **accessibility product** team.
   - Read the existing cases under `BStackAutomation/a11y_engine/` for the touched lane/area (requires the
     BStackAutomation checkout — workspace root or a sibling clone).
   - Also check the engine repo's **in-repo unit suites** (per `knowledge/TESTING.md`):
     `a11y-engine-core/test/`, `dom-forge-core/test/`, `ip-protection/test/` — for unit-level coverage.
   - `stack:test-suite-audit` (general BStackAutomation coverage/right-layer audit) can help map what the
     `a11y_engine/` suite already covers.

Feed BOTH — the feature-impact context AND the existing-coverage inventory — into the designer in the next
step, so it proposes only the **valid new cases needed to close the coverage gap** (and flags any that
existing automation already covers → feeds the documented-skip decision below).

## The common flow

1. **Design the gap cases with `stack:test-case-designer`** (BStackAutomation stack; product-agnostic),
   passing the Step-0 context (engine KB impact + existing-coverage inventory) alongside the Jira key /
   Task Brief / this tech spec. It emits a **17-column, TCM-import-compatible** table + test plan —
   scoped to the incremental coverage, deduped against the existing suites. Columns: `TC ID | Feature | Title | Folder Path | State | Owner | Priority | Type of
   Test Case | Automation Status | Automation Method | Impact Area | Description | Preconditions | Template
   | Steps | Expected Result | Team`.
2. **Land the cases in TCM** (BrowserStack Test Management) — paste/import the table.
3. **TRA integration** — automated runs report to TRA; results are queryable per TC id / quality-gate via
   `stack:tra-reports` (first-run pass/fail, flaky/new failures, quality-gate status). The spec pins the
   TCM link and the TRA quality-gate expectation.

## The gate (cross-stack)

`stack:test-case-designer` lives in a **different stack** than a11y-engine, so it may not be installed in
an engine-only Claude session.

1. **If `stack:test-case-designer` is available here** (workspace root, or a BStackAutomation session):
   invoke it with the Jira key + this tech spec as the source; capture the table + TCM destination.
2. **If it is NOT available** (engine-only repo session): **STOP and block**. Tell the engineer:
   > "Test cases are mandatory and are designed via `stack:test-case-designer`, which isn't installed in
   > this engine-only session. Run `/stack:test-case-designer <JIRA>` at the workspace root (or a
   > BStackAutomation session), then paste back the TCM link + table so I can finish the spec."
   Do **not** hand-author the 17-column table yourself as a substitute.

## Documented skip path (when no new tests are warranted)

Test cases are mandatory **by default**, but the developer may skip designing new ones when the task's
nature means there is nothing new to test and **existing automation already covers it** — e.g. a pure
refactor, a config-only flag flip, a version bump with no behavior change, or a fix already exercised by
an existing suite.

A skip is **only** valid as an **explicit, justified statement** in the QA section, not an omission:
- State that no new test cases are added and why (one line).
- Name the **existing TCM suite / automation cases** that cover the change, and the **TRA build** where
  they run green (queryable via `stack:tra-reports`).
- The developer confirms this — the skill does not decide it.

A blank or "N/A" QA section is never acceptable. If new behavior, a new lane/rule, a contract change, or a
new config flag is introduced, the skip path does **not** apply — design the cases.

## What goes into the spec's QA / Testing section

When new cases are designed (the default), the spec **documents the designed cases** — the 17-column
table itself (embedded or linked) — plus the planned **test dimensions** (the engineering view). A TCM
link and a TRA quality-gate build are **NOT** finalization requirements for the design path: landing
the cases in TCM and getting a green TRA build are downstream follow-ups. TCM/TRA links are required
**only on the documented-skip path** (below), where they are the evidence backing the claim that
existing automation already covers the change. Cover, at minimum, the dimensions relevant to the change:

- **Per lane** — A / B1 / B2 / C / AI behavior touched by this change.
- **Config-flag permutations** — each `a11yCoreConfig` flag on/off (advanced, ai, snapshots, isMobile, …);
  flag-off / older-engine-version is a guaranteed safe no-op.
- **Scope-key / EOF / batching** — result→scan mapping correctness; EOF completion; batched-response collation.
- **Engine environments** (from `knowledge/TESTING.md`, the categories prod bugs come from): shadow DOM,
  cross-origin iframes, mutation vs full-page, P0 sites + one site in the affected domain, Redis stress.
- **FP/TP accuracy validation** — for rule changes, validate against an **axe-core baseline over a URL set**
  (the engine's historical test modality, e.g. ~100 URLs) and run the affected rule(s) via `stack:debug-fp`
  / `mini-percy-renderer`; record verdicts / a failed-assertions table.
- **Saved-state automation harness** — for Type C / DOMForge rules, exercise the saved-state run harness
  (per "Type C Rules Automation Spec") so results are reproducible without live Percy.
- **Unit coverage** — the happy / empty / error triad per affected package (a11y-engine-core, dom-forge-core,
  ip-protection), per `TESTING.md`.

> Note: AllyEngine specs have historically under-specified testing. The TCM + TRA flow above is a
> deliberate standardization (the common org guideline), layered on top of these engine-native modalities —
> not a description of legacy specs.

### Shape to paste into the spec

```markdown
## QA / Testing

New test cases were designed for this change (the documented-skip path does not apply). Designed cases
(17-column, TCM-import-compatible): <embedded table, or link to the companion test-cases doc> — via
`stack:test-case-designer`.
<TCM landing + TRA quality-gate build are downstream follow-ups, not finalization gates for this spec.>

**Planned test dimensions:**
- **Lanes (A/B1/B2/C/AI):** …
- **Config-flag permutations (safe no-op when off/older):** …
- **Scope-key / EOF / batching:** …
- **Engine environments (shadow DOM, cross-origin iframes, mutation on/off, P0 sites, Redis stress):** …
- **FP/TP validation:** rule(s) …; verdicts …
- **Unit (happy/empty/error):** a11y-engine-core …; dom-forge-core …; ip-protection …
```
