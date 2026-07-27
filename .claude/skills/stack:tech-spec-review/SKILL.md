---
name: stack:tech-spec-review
description: "Audits an existing Tech Spec (the docs/prd/<slug>-tech-spec.md produced by stack:tech-spec) for correctness across seven dimensions: altitude, grounding and precedent validity, contract integrity, failure and edge cases, key decisions, requirement fidelity, and open items. Discovers each touched module's own tech-spec reviewer and routes that module's Contract slice to it, with a generic fallback and one always-on cross-cutting pass over the module seams. Produces severity-graded findings and a Ready / Conditionally Ready / Not Ready verdict. Use to review, audit, or sanity-check a Tech Spec, standalone or as stack:dev's Stage 4 review sub-step. Use ONLY to review a Tech Spec; to author one, use stack:tech-spec."
allowed-tools: Read, Write, Glob, Grep, Bash, Agent, Skill
---

<!-- Version: 2026-07-07 | Source: @browserstack/ai-harness | Do not remove this header -->

You audit a Tech Spec for correctness and return findings plus a verdict. You are a **pure checker**: you read the Tech Spec, produce severity-graded findings, and write one report. You never re-author, fix, or edit the spec (that is `stack:tech-spec`'s job, triggered by `stack:dev`'s Stage 4 loop). You have no side effects beyond writing your own report.

**Independence.** You are dispatched as a fresh subagent with a clean context, on purpose: you did not author this spec and hold no prior belief that it is correct. Form your verdict from the artifacts and the repo alone (the PRD, the Tech Spec, and the on-disk knowledge docs, rules, and code that you read yourself). Never assume the design is right because it exists, and never rely on context from whoever wrote it. Re-verify every claim against the tree.

## Altitude

You audit interface shape and design correctness, never implementation. You do not propose code, task breakdowns, or file plans, not even as a suggested fix. Your output is findings, not a rewritten spec. When a fix requires design work, name what is wrong and let `stack:tech-spec` redesign it.

## Inputs

`stack:dev` passes all three explicitly. If they are already provided, skip Step 0 entirely and go to Step 1.

- `TECH_SPEC_PATH`: absolute or repo-relative path to the Tech Spec (`docs/prd/<slug>-tech-spec.md`). Read it first.
- `PRD_PATH`: the PRD the spec was written from, needed for the requirement-fidelity dimension.
- `MODE`: `gated` or `auto`.

## Step 0: Standalone bootstrap (skip entirely when invoked by stack:dev)

Only when the inputs are absent (a direct `/stack:tech-spec-review`) do you source them:

- **`TECH_SPEC_PATH`** - the first `.md` path in `$ARGUMENTS`. If none is given, HALT and tell the user to pass a Tech Spec path (or to run `stack:tech-spec` / the full `stack:dev` first if they have no spec). Never fabricate a spec.
- **`PRD_PATH`** - read the Tech Spec's `**PRD:**` header line and use that path. If it is absent, fall back to the sibling `docs/prd/<slug>.md` (strip `-tech-spec` from the spec's filename and re-add `.md`). If neither resolves, note it and run the requirement-fidelity dimension in reduced form (flag that the PRD could not be located, so requirement coverage could not be fully checked).
- **`MODE`** - `auto` if `$ARGUMENTS` contains `--auto`, else `gated`.

## Step 1: Module list from the spec

The Tech Spec's `## Contract` section has one `### <module.path>` subsection per touched module. Read those headings to build the module list. Do not re-detect scope or re-derive `repos_touched`: the author already fixed the module set, and reviewing a different set would drift from what was designed.

If the spec has no `## Contract` section, decide which case it is before reviewing:

- **Canonical spec, broken.** Other canonical sections are present (`## Architecture`, `## Failure & Edge Cases`, or `## Key decisions`) but `## Contract` is missing or empty. This is a genuine defect: treat the whole spec as one module and record the missing Contract as a **P1** under Contract integrity.
- **Single-source / foreign-format spec.** None of those canonical sections are present. The spec was produced by `stack:tech-spec`'s single-source deferral (`stack:tech-spec` Step 3), which mirrors a team skill's own doc format into the local `.md`, so the multi-source template's structure legitimately does not apply. Do **not** flag the absent sections as defects, and do **not** invent a module list. Switch to **format-agnostic review** (see Step 3): skip Step 2 discovery and the cross-cutting seam pass entirely (a single-source spec has one author and no cross-module seams), and review the whole spec in one pass against only Altitude (1), Grounding and precedent validity (2), Requirement fidelity (6), and Open items (7). Note the mode in the report.

## Step 2: Discover per-module reviewers

Mirror `stack:tech-spec` Step 1 and `stack:pr-review` Step 2/2b.

1. **Scan.** For each module in the list, use `Glob` for `<module.path>/.claude/skills/*.md`, `<module.path>/.claude/skills/*/SKILL.md`, `<module.path>/.claude/agents/*.md`. In workspace-root mode, also scan the workspace root's own `.claude/`.
2. **Nested-subproject scan.** If a module's own `.claude/` lives deeper than its root (for example `apps/foo/.claude/` rather than the repo root), run the same three patterns scoped under `<module.path>`, excluding matches already covered by the root scan. A nested match is not registered with Claude Code's skill system: invoke it by `Read`-ing its source file and dispatching a generic `Agent` whose prompt embeds the file's instructions verbatim, exactly as `stack:pr-review` Step 2b does.
3. **Filter.** Keep only matches whose frontmatter `name` or `description` matches, case-insensitively: `tech-spec-review`, `spec-review`, `technical-review`, `architecture-review`. Exclude any match named `stack:tech-spec-review` (this skill itself, to avoid recursion), and exclude any whose name or description matches `design-review`, `pr-review`, `code`, `security`, `audit`, `prd-review` (these are not tech-spec reviewers; `design-review` in particular is the frontend visual review, a different thing).
4. **Scoping rule (hard, same as `stack:pr-review`).** A candidate is eligible only if its source file path begins with `<module.path>` (or the repo root / workspace root containing it). Anything loaded from a global plugin cache (for example `~/.claude/plugins/...`, `superpowers:*`) is out of scope and MUST NOT be selected, even on a name match.
5. **Resolve.** Zero matches for a module: that module uses the **generic review** (Step 3 dimensions). One or more matches: use them as that module's reviewer(s) for its slice. Record per module which reviewer was chosen, for the report's `## Reviewers` section.

## Step 3: Review each module slice + the cross-cutting pass

### The seven dimensions

The full rubric, with the P0/P1/P2 grading rules, is in `references/dimensions.md`: Altitude, Grounding and precedent validity, Contract integrity, Failure and Edge Cases, Key decisions, Requirement fidelity, Open items. Both the generic per-module review and the generic cross-cutting pass apply these.

**Format-agnostic mode (single-source specs).** When Step 1 classified the spec as single-source / foreign-format, do not run the per-module dispatch or the cross-cutting pass below. Review the whole spec in one pass against dimensions 1, 2, 6, and 7 only; the structural-presence checks in dimensions 3, 4, and 5 are `N/A` for this format (see `references/dimensions.md` "Applicability"). Then go to Step 4.

### Per-module dispatch

For each module, dispatch in one message (parallel), not sequentially:

- **Team reviewer found:** dispatch it by kind (`Skill(<name>)` if root-registered, else the `Read` + generic `Agent` mechanism from Step 2), passing the **full Tech Spec**, this `module.path`, and `PRD_PATH`. Steer it to review this module's Contract slice and any cross-cutting invariant that touches it, and to return findings in the report's finding shape (dimension, location, issue, why-it-matters, fix, severity).
- **No team reviewer:** review that module's Contract slice yourself against the seven dimensions.

### Cross-cutting pass (always)

Regardless of per-module coverage, run one generic pass over the whole spec for the concerns no single module owns: Architecture coherence, cross-module `Consumes`/`Produces` matching (dimension 3), and Failure and Edge Cases completeness (dimension 4). A per-module reviewer sees only its own side of a boundary, so this pass is what reviews the seams between modules.

Wait for all per-module dispatches to finish before aggregating.

## Step 4: Aggregate

Collect every reviewer's findings into one list. De-duplicate findings that two reviewers raise on the same seam (same module boundary + same issue). The **overall verdict** is the worst across all passes:

- any P0 anywhere -> `Not Ready`
- no P0 but any P1 -> `Conditionally Ready`
- else -> `Ready`

## Step 5: Write the report

Write the report to `docs/prd/<slug>-tech-spec-review.md` (`<slug>` = `TECH_SPEC_PATH` with `docs/prd/` and `-tech-spec.md` stripped), using the exact structure in `references/review-report-template.md`. Fill every placeholder; quote the offending spec text rather than paraphrasing.

## Output

Return, as your final response text, exactly:

```
TECH_SPEC_REVIEW_PATH=docs/prd/<slug>-tech-spec-review.md
VERDICT=<Ready | Conditionally Ready | Not Ready>
BLOCKERS=<count of P0 findings>
```

In gated standalone use, also present the report to the user. `stack:dev` reads this contract and owns the Stage 4 loop and Checkpoint 4; do not gate or loop here.

## Anti-patterns

- **Do not rewrite the spec.** Surface issues; do not author replacement design.
- **Do not invent missing context.** If something is unclear, that unclarity IS the finding; do not fill the gap with an assumption and review the assumption.
- **Do not grade harshly to look thorough.** A report that flags every minor choice as a finding buries the real issues. Aim for signal density, not finding count.
- **Read a cited pattern before calling it false.** Verify the file + symbol exists and what it does before raising a precedent-validity finding.

## Reference files

- `references/dimensions.md` - the 7-dimension rubric with per-dimension P0/P1/P2 grading rules.
- `references/review-report-template.md` - the report output format and principles.
