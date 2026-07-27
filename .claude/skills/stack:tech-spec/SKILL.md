---
name: stack:tech-spec
description: 'Stage 4 of stack:dev: produce a repo-grounded technical design + cross-module interface contract before per-track implementation planners run. Discovers team tech-spec skills and defers to one that covers the whole feature; otherwise drafts covered modules via their skills, gathers boundary needs for frontend/uncovered modules, ideates genuinely-open (uncovered non-frontend) design via superpowers:brainstorming, and synthesizes one Tech Spec with a mandatory Failure & Edge Cases pass. Invoked by stack:dev as Stage 4, or standalone against an existing PRD (pass the PRD path as an argument).'
allowed-tools: Read, Write, Glob, Grep, Bash, Agent, Skill
---

<!-- Version: 2026-07-02 | Source: @browserstack/ai-harness | Do not remove this header -->

You produce the Tech Spec for `stack:dev`'s Stage 4: a grounded technical design, a systematic Failure & Edge Cases pass, and an explicit cross-module interface contract. You delegate genuinely-open _design_ (to team tech-spec skills and to `superpowers:brainstorming`) and own the _synthesis_ yourself. You never write implementation code, task breakdowns, or file-level plans.

## Inputs

`stack:dev` passes all three explicitly. Standalone (direct `/stack:tech-spec`), they are absent and Step 0 sources them - see there.

- `PRD_PATH`: absolute path to the PRD (read it first). The PRD is authoritative on _what_ (the requirements) - do not re-derive those. It is only _illustrative_ on _how_: any concrete path, route, enum value, or schema it names is a suggestion to verify against repo convention, never a directive to copy. Where the PRD's _how_ conflicts with grounded convention, that is a `[NEEDS CLARIFICATION]`, not a silent adoption of the PRD's version.
- `REPOS_TOUCHED`: `stage_plan.repos_touched` from `stack:dev` Stage 1. Do not re-derive it when `stack:dev` provides it; standalone, derive per Step 0.
- `MODE`: `gated` or `auto` (from `stage_plan.checkpoints`); standalone defaults to `gated` per Step 0.

## Altitude (hard rule, everywhere)

Cite existing code by file + symbol (the function, class, route, or config key), never by line number - line numbers drift and go stale. Never prescribe new code. In scope: interface shapes, storage/state schema shape, failure modes, which existing pattern is followed, ownership boundaries. Out of scope: new files/functions/classes, task breakdown, ordering, effort estimates - those belong to the per-track planner that runs after this stage.

## Step 0: Standalone bootstrap (skip entirely when invoked by stack:dev)

`stack:dev` hands you `PRD_PATH`, `REPOS_TOUCHED`, and `MODE`. **If all three are already provided, do nothing here and go straight to Step 1** - the orchestrated path never runs this step, so its behavior is unchanged. Only when they are absent (a direct `/stack:tech-spec` invocation) do you source them:

- **`PRD_PATH`** - the first `.md` path in `$ARGUMENTS`. If none is given, HALT and tell the user to pass an existing PRD path, or to run `stack:author-prd` (or the full `stack:dev`) first if they have no PRD. Never fabricate a PRD.
- **`MODE`** - `auto` if `$ARGUMENTS` contains `--auto`, else `gated`.
- **`REPOS_TOUCHED`** - detect scope, then derive (mirrors `stack:dev` Stage 1):

  ```
  SCOPE=single-repo
  if [ -f bstack-ai-harness.yml ] && grep -qE '^workspace:' bstack-ai-harness.yml; then SCOPE=workspace-root; fi
  if [ -f stack-workspace.yml ] || [ -f .claude/stack-workspace.yml ]; then SCOPE=workspace-root; fi
  ```

  - **single-repo:** `REPOS_TOUCHED` is the current repo.
  - **workspace-root:** the member repos the PRD names. If that is ambiguous, ask the human (gated) rather than guessing; under `--auto`, fall back to every member repo the PRD references and note the assumption.

Everything from Step 1 on is identical for both entry points.

## Step 1: Discover tech-spec skills

One inventory pass over the relevant scope:

- **workspace mode:** the workspace root's own `.claude/skills`/`.claude/agents` AND every member repo's own `.claude/skills`/`.claude/agents`.
- **domain/single-repo mode:** just that repo's own `.claude/skills`/`.claude/agents`.

Use `Glob` for `*/.claude/skills/*.md`, `*/.claude/skills/*/SKILL.md`, `*/.claude/agents/*.md` at each in-scope location. Keep matches whose frontmatter `name` or `description` matches (case-insensitive): `tech-spec`, `technical-brief`, `blueprint`, `architecture`. Exclude `stack:tech-spec`/`stack:dev-architect` (recursion) and unrelated hits (`design-review`, `pr-review`, `security`, `audit`).

**Hard scoping rule (same as `stack:pr-review`):** a candidate is eligible only if its source file lives inside the relevant scope's own `.claude/`. Anything from a global plugin cache (`~/.claude/plugins/...`, `superpowers:*`) is out of scope and MUST NOT be selected, even on a name match.

## Step 2: Determine coverage

For each candidate, read its own description for what it covers: named repos/modules (**scoped**) or none (**general**). A keyword match is necessary but not sufficient - apply domain-fit judgment (a tech-spec skill owned by an unrelated team is not a match for this feature). Record why you kept or dropped each candidate.

## Step 3: Single-source shortcut

If one candidate's coverage spans _every_ module the feature touches (after the Step 4 subdivision below), defer the whole stage to it:

- Run it to completion, full ceremony, including its own publish/decompose/gate. Invoke via `Skill()` foreground if it is interactive (gated mode).
- **Always materialize a local `docs/prd/<slug>-tech-spec.md`** capturing its content - write one from its returned/published content if it only published remotely. Downstream builders read the local file; they cannot be assumed to have Atlassian/other MCP access, especially under `--auto`.
- Print the deferral transparency line: `Deferring the entire Tech Spec to <skill>; its failure-mode coverage is whatever <skill> does natively.` The human may override into the multi-source path.
- Its own approval gate is Checkpoint 4. Skip to Step 9.

This fires rarely for full-stack features (a backend tech-spec skill rarely also covers frontend); that is intended.

## Step 4: Module list

Only if Step 3 found no full-coverage candidate. Seed one module per `REPOS_TOUCHED` entry. Split an entry only when the PRD names two or more distinct services/packages within it (a `services/`, `packages/`, or `apps/` layout the PRD describes as independently touched). If the boundary is unclear, keep the repo as one module - never guess a split.

## Step 5: Route each module (three kinds)

- **Covered** - a Step 1/2 candidate covers it → that skill is its contributor (Step 6 Draft, steered).
- **Frontend / Plumb-managed** - the module is the frontend track's territory (a Plumb-managed frontend repo/app) → **boundary-only**: `stack:dev-architect` reports what it consumes/produces; its internal design is deferred to Plumb in Stage 5. No ideation here.
- **Uncovered non-frontend** - neither covered nor frontend → `stack:dev-architect` grounds it, and it goes into the Step 7 shared ideation session.

Multiple candidates covering one module: no "pick one" conflict (nothing runs as an exclusive override) - include each draft as a separate tagged input to synthesis.

## Step 6: Draft phase (parallel)

Dispatch in one message, multiple calls:

- **Covered modules:** invoke each covering skill **steered to STOP before its own publish/decompose/side-effect steps** and return a pre-publish draft. Treat its draft at "initial draft" fidelity (not its post-publish form). Separately extract that skill's **declared hard rules** - its "never"/"must"/"mandatory"/"non-negotiable" language - as a tagged block, distinguishing rules that apply only to its module from rules that span more than one repo (the latter feed Cross-cutting invariants in Step 8).
  - **If a covering skill cannot be steered to stop before its side-effects** (e.g. it publishes as its first step): HALT with a clear message naming the skill and its owner to ping. Do not run it (unwanted side effects) and do not silently drop it. Internal tech-spec skills are required to support stop-before-side-effects; a skill that does not is a bug to fix, not to work around.
- **Frontend + uncovered-non-frontend modules:** dispatch `stack:dev-architect` (grounding + boundary).

Wait for all Draft-phase dispatches to finish before Step 7 (hard prerequisite).

## Step 7: Ideation phase (only if there are uncovered non-frontend modules)

Invoke **one** shared `superpowers:brainstorming` session covering all uncovered non-frontend modules together (never one session per module - one shared session keeps them from diverging). Seed it with: the PRD, those modules' grounding packets, and the **covered modules' + frontend modules' boundary/Contract portions as FIXED context** (design against them, do not renegotiate them). Steer with three overrides:

1. The PRD is settled - skip your own requirements-gathering step.
2. The provided grounding and the fixed-context interfaces are primary - design against them; independent re-verification against the live tree is fine, renegotiating decided interfaces is not.
3. Stop once the design is produced - do NOT auto-continue into `writing-plans`.

Gated: `Skill(superpowers:brainstorming)` foreground. `--auto`: background `Agent`, pauses pre-resolved. If there are no uncovered non-frontend modules, skip this step.

## Step 8: Synthesis phase (your own work - not a brainstorming call)

Synthesis is where the design decisions get made. Run 8a-8c even when every module was drafted by a covering skill: covering skills produce one design, not a decision with alternatives, so the pivotal fork and the minimal-machinery check will not have happened unless you do them here.

### 8a. Pivotal decisions (do this first, regardless of coverage)

Identify the 1-2 load-bearing decisions this feature hangs on (typically: how state is represented, and where enforcement lives). For each:

- **Present 2-3 options with tradeoffs, simplest first.** Lead with the fewest-moving-parts option that still satisfies the PRD. Climb to a heavier option only when a specific PRD requirement forces it - and name that requirement. New machinery (a new state value, a background/queue worker, a cross-cutting overlay, new infra) is guilty until proven: justify it against a simpler alternative or drop it. "Simplest" means fewest moving parts that still meets the requirement - never minimal-by-dropping-the-requirement.
- **State the chosen option and list the rejected ones** so the reviewer sees the fork. If a contributed draft already committed to a heavier option without weighing a simpler one, reopen it here.
- **Pin the concrete surface.** Name the product surface / entry point where the primary behavior actually happens (which flow, which controller or page), not just a function name. State plainly what is the enforcement/security boundary versus what is only presentation.

### 8b. Validate every reused precedent (semantic, not lexical)

Before any cited existing pattern becomes a TEMPLATE (not merely a reference), state in one line what that existing thing actually DOES and confirm it solves the same KIND of problem as this feature. A name or keyword match is not enough: if the precedent is a differently-purposed feature that merely shares vocabulary, say so and do NOT model on it. Apply this to precedents inside covered-skill drafts too - a covering skill's draft can still lean on a false precedent.

**Verify interface shape against convention, not against the PRD's wording.** Before any endpoint, route, controller, enum, or schema enters the Contract, check the actual route/config file (e.g. `config/routes.rb`) for how the subsystem's sibling operations are already shaped, and match that convention. If you are extending an existing subsystem, its endpoints live where its siblings live - do not invent a parallel surface (a new namespace, controller, or versioned API) unless a stated requirement forces it. A shape the grounding flags as "greenfield / no existing route" while sibling operations have an established convention is a red flag to reconcile, not a design to adopt.

**Best-match convention, not nearest touchpoint.** When more than one existing convention could carry the design, pick the one whose SHAPE fits the problem, not the mechanism the nearest existing touchpoint happens to use. A persistent per-device or per-scope config belongs on the subsystem's config-push + state-file convention even if today the value rides a per-request injection path; a durable record belongs on the record/table convention even if a similar value is currently ephemeral. Extending the nearest mechanism because it is nearest is the trap: in a Key decision, name the candidate conventions and choose by problem shape, not proximity.

### 8c. Merge

- **Merge, don't concatenate.** The Architecture section is one coherent design; each module's Contract derives from it. A module's `Consumes` must match another module's `Produces` verbatim.
- **Run the Failure & Edge Cases checklist** (below) across all modules - answer each or mark `N/A - <reason>`; never omit.
- **Enforce hard rules.** You may restructure format freely, but never violate or soften any hard rule extracted in Step 6. Per-module rules go in that module's Contract (`Hard rules preserved`); rules spanning more than one repo go in the top-level `Cross-cutting invariants` section.
- **Do not silently rewrite a covered module's contract.** A covering skill owns its module's design. If reconciliation needs to change a covered contract, that is a conflict - surface it as `[NEEDS CLARIFICATION]` (or, gated, raise it), never a unilateral edit.
- **Surface conflicts, don't resolve them silently.** Any place two modules' interfaces disagree, the design contradicts a decided interface, or a PRD requirement contradicts a stated design boundary (e.g. "touch every product" vs "keep product X separate"), becomes a `[NEEDS CLARIFICATION]` item under Open items - elevated, not buried in prose.

### Failure & Edge Cases checklist (all five, every multi-source run)

1. **Partial failure** - one module's write commits, another's doesn't (or a request spans N modules and fails partway): observable outcome, self-heal or not?
2. **Concurrency** - worst-case concurrent/overlapping pattern _across_ modules.
3. **Consistency window / blind spots** - can two consumers observe divergent state momentarily; does anything read the underlying primitive directly without knowing about the new behavior (silently wrong, not gracefully degrading)?
4. **Toggle/rollback mid-flight** - feature flag flips off, or the change is rolled back, while something is mid-lifecycle.
5. **Scale/load** - any volume assumption that breaks under real load (lock contention, N+1, polling storms)?

## Step 9: Checkpoint 4 and write

- Write the Tech Spec to `docs/prd/<slug>-tech-spec.md` (`<slug>` = `PRD_PATH` with `docs/prd/` and `.md` stripped). Single-source path: this is the local `.md` from Step 3.
- **Persist immediately** - return the output contract below to `stack:dev` (which writes session state) BEFORE any Checkpoint 4 prose. Do not defer the write to after approval.
- **Checkpoint 4:** gated - present the doc (or the single-source skill's own gate) for approval; on a change request re-enter from the relevant step with the feedback as added context. `--auto` - proceed; unresolved `[NEEDS CLARIFICATION]` items carry into the Stage 8 final-gate findings checklist.

## Output

Return, as your final response text:

```
TECH_SPEC_PATH=docs/prd/<slug>-tech-spec.md
MODULES=[{"path": "<module.path>", "contributor": "<covering skill name | stack:dev-architect | plumb-deferred>"}, ...]
```

## Doc template (multi-source path; single-source uses its skill's native format mirrored into the local .md)

```markdown
# Tech Spec: <feature name, from the PRD title>

**PRD:** <PRD_PATH> | **Date:** <YYYY-MM-DD>

## Architecture

<one coherent cross-module design: approach, data flow. Name the concrete surface where the primary behavior happens.>

## Key decisions

<the 1-2 pivotal decisions from Step 8a. For each: the chosen option (simplest that meets the PRD), the rejected alternatives with why, and - if a heavier option was chosen - the specific PRD requirement that forced it. Omit only if the feature genuinely has no load-bearing fork.>

## Cross-cutting invariants

<hard rules that span more than one module (e.g. a scoping invariant a covering skill mandates across all its repos), or "None.">

## Failure & Edge Cases

1. **Partial failure:** <answer, or N/A - reason>
2. **Concurrency:** <answer, or N/A - reason>
3. **Consistency window / blind spots:** <answer, or N/A - reason>
4. **Toggle/rollback mid-flight:** <answer, or N/A - reason>
5. **Scale/load:** <answer, or N/A - reason>

## Contract

### <module.path 1>

**Grounded in:** <CITED_PATTERN, or the low-confidence flag, or a link to the covering skill's draft>
**Consumes:** <...>
**Produces:** <...>
**Ownership:** <...>
**Hard rules preserved:** <this module's non-negotiable rules, if any>

<repeat per module; a frontend module's Contract carries its Consumes/boundary only - design deferred to Plumb>

### Open items

<[NEEDS CLARIFICATION: ...] bullets, or "None.">
```
