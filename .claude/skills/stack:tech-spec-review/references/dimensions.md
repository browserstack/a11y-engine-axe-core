<!-- Version: 2026-07-07 | Source: @browserstack/ai-harness | Do not remove this header -->

# Tech Spec review dimensions

The seven dimensions the generic reviewer audits. Both the generic per-module review and the always-on cross-cutting pass apply these. Each dimension states what it audits, the check to run against the spec, and what earns a P0 vs P1 vs P2.

**Applicability.** Dimensions 3, 4, and 5 carry structural-presence checks that assume the canonical multi-source Tech Spec template (a `## Contract` with per-module `Consumes`/`Produces`, the five-item Failure & Edge Cases checklist, and a `## Key decisions` section). On a single-source / foreign-format spec (see `SKILL.md` Step 1), that structure legitimately does not exist: those presence checks are `N/A` and their absence is never a finding. Dimensions 1, 2, 6, and 7 apply to every spec regardless of format.

## 1. Altitude

Audits whether the spec stayed at design altitude. A Tech Spec describes interface shapes, state/schema shapes, failure modes, ownership boundaries, and which existing pattern is followed. It must cite existing code by file + symbol (the function, class, route, or config key), never by line number, and must never prescribe new files, functions, classes, a task breakdown, ordering, or effort estimates: those belong to the per-track planner that runs after this stage.

Check: scan every section for imperative "create/add a new <file|function|class|table>" language, for any numbered task list, and for effort/time estimates.

Grading: a task breakdown or an ordering of implementation steps is **P0** (the stage overreached into planning). A single prescribed new symbol (a named new function/class the spec says to write) is **P1**. Vague "we will add code here" hand-waving with no grounding is **P2**.

## 2. Grounding and precedent validity

Audits whether the design is grounded in real, correctly-chosen precedent. Every reused pattern that becomes a template must actually exist and solve the same KIND of problem as this feature, not merely share vocabulary. Interface shapes must match the convention of the subsystem's sibling operations, not the PRD's illustrative wording.

Check: for each `Grounded in:` reference or cited `file:symbol`, confirm it is concrete (a real file + symbol, not a line number) and that the "what it does" matches this feature's problem kind (semantic, not lexical). Flag an invented greenfield surface (a new namespace, controller, or versioned API) where a sibling convention already exists.

Grading: modeling on a false precedent (a differently-purposed feature that merely shares a keyword) is **P0** (it will steer the implementation wrong). An unverifiable or invented citation is **P1**. A greenfield surface introduced where a sibling convention exists, without a stated requirement forcing it, is **P1**.

## 3. Contract integrity

Audits the cross-module interface contract. Each module's `Consumes` must match, verbatim, the `Produces` of the module it depends on, and ownership (who owns retries, timeouts, and rollback) must be stated for anything crossing a boundary.

Check: pair every `Consumes` field against the `Produces` of the module it depends on and confirm the names and shapes match exactly. Confirm each cross-boundary interaction names an owner.

Grading: a `Consumes`/`Produces` mismatch (a field name, shape, or event the two sides disagree on) is **P0** (a guaranteed integration break). An unstated ownership boundary on a cross-module interaction is **P1**.

## 4. Failure and Edge Cases

Audits whether the mandatory failure analysis was actually done. All five checklist items must be answered or explicitly marked `N/A - <reason>`: partial failure (one module commits, another does not), concurrency (worst-case overlapping pattern across modules), consistency window / blind spots (can two consumers observe divergent state; does anything read the underlying primitive without knowing about the new behavior), toggle/rollback mid-flight (flag flips or change is rolled back mid-lifecycle), and scale/load (any volume assumption that breaks under real load).

Check: confirm each of the five appears with a real answer or an explicit `N/A - reason`.

Grading: a silently omitted item is **P1**. An item answered in a way that reveals an unhandled data-loss, split-brain, or silent-correctness hole is **P0**.

## 5. Key decisions

Audits the pivotal-decision analysis. The 1-2 load-bearing decisions the feature hangs on must be present with their rejected alternatives, the chosen option must be the simplest that still meets the PRD, and any new machinery (a new state value, a background/queue worker, a cross-cutting overlay, new infra) must be justified against a simpler alternative or flagged.

Check: confirm a `Key decisions` section exists (unless the feature genuinely has no load-bearing fork) and that any new machinery is justified against a named simpler option.

Grading: unjustified new machinery (a heavier option chosen without weighing a simpler one) is **P1**. A missing pivotal-decision section on a feature that clearly has a fork is **P1**. A justification that is present but thin is **P2**.

## 6. Requirement fidelity

Audits whether the spec satisfies the PRD. The spec must cover the PRD's _what_ (the requirements), and any place the PRD's illustrative _how_ (a concrete path, route, enum, or schema it names) conflicts with grounded convention must be surfaced as `[NEEDS CLARIFICATION]`, not silently adopted.

Check: map each PRD requirement to where the spec addresses it; flag a requirement with no coverage. Flag any PRD path/route/enum the spec adopted verbatim where it conflicts with the subsystem's sibling convention.

Grading: a **core** PRD requirement (one the primary behavior depends on) with **no** spec coverage is **P0**. A secondary requirement left uncovered, or any requirement whose coverage is partial or ambiguous rather than plainly absent, is **P1**. This dimension maps prose to prose, so reserve P0 for an unmistakable gap in a core requirement and grade down whenever the mapping is a judgment call. A silently-adopted PRD `how` that conflicts with grounded convention (rather than being raised as a clarification) is **P1**.

## 7. Open items

Audits the spec's own open questions. Every unresolved `[NEEDS CLARIFICATION]` marker left in the spec is a finding: a spec that ships with open questions is not Ready. This dimension is a **backstop**: `stack:dev` normally resolves open clarifications with the human before dispatching the review, so a clarification reaching you means it slipped that gate (a re-author introduced a new one, a single-source spec, or an `--auto` run with no human) and still must be flagged.

Check: count the `[NEEDS CLARIFICATION]` markers; each becomes a finding.

Grading: each unresolved marker is **P1** by default. A marker that blocks a core flow (the primary behavior cannot be built until it is resolved) is **P0**.

## Severity

- **P0** - a blocker that would cause incorrect implementation or a guaranteed integration break.
- **P1** - a real gap a reviewer should fix before build, but that would not silently corrupt the design.
- **P2** - a minor or stylistic issue.

When in doubt between P0 and P1, choose P1; between P1 and P2, choose P2. Reserve P0 for true blockers.
