# Stage providers (pluggable stages)

`stack:dev` runs each stage through a named **provider**. A team can swap any provider for their own skill/agent, or disable a stage, without changing the orchestrator. Providers resolve by skill/agent **name** (not path), so an override only needs to be installed under the configured name.

## Roles and defaults

| Role               | Stage                         | Kind  | Default provider                                                               |
| ------------------ | ----------------------------- | ----- | ------------------------------------------------------------------------------ |
| `prd_author`       | 2 Author PRD                  | skill | `stack:prd-create`                                                             |
| `prd_review`       | 3 Review PRD                  | skill | `stack:prd-review`                                                             |
| `tech_spec`        | 4 Tech Spec                   | skill | `stack:tech-spec`                                                              |
| `tech_spec_review` | 4 Tech Spec (review sub-step) | skill | `stack:tech-spec-review`                                                       |
| `backend`          | 5 Implement (backend)         | agent | `stack:backend-builder`                                                        |
| `frontend`         | 5 Implement (frontend)        | skill | `stack:intake` (Plumb)                                                         |
| `qa`               | 5 Implement (QA tests)        | agent | `stack:qa-test-author`                                                         |
| `design_review`    | 7 Design review               | skill | `stack:design-review`                                                          |
| `open_pr`          | 7 Open PR (backend/general)   | skill | `stack:open-pr`                                                                |
| `code_review`      | 7 Code review of opened PR(s) | skill | `stack:pr-review` (single-repo) / `stack:workspace-pr-review` (workspace-root) |

`code_review` is the one mode-dependent default: in workspace-root mode (the common case for harness users) it defaults to `stack:workspace-pr-review` (one root run that orchestrates the member-repo reviews); in single-repo mode it defaults to `stack:pr-review` (run per PR). An explicit `dev.providers.code_review` value overrides both.

## Overriding

Set any subset under a `dev.providers` map in the repo's `bstack-ai-harness.yml` (or, in workspace mode, the workspace-root config). Unset roles use the default.

```yaml
dev:
  providers:
    prd_review: [team:my-prd-reviewer, stack:prd-review] # list: first installed wins; gated mode offers the choice
    qa: team:contract-test-author # single provider
    design_review: off # disable this stage
```

A provider value may be:

- a single skill or agent **name** (use that one), or
- a **list of names** in priority order (multiple options for the role), or
- `off` / `none` (disable that stage).

A provider may be a **skill or an agent regardless of the role's default kind**: the orchestrator detects the resolved provider's kind and dispatches accordingly (`Skill(<name>)` for skills, `Agent(<name>)` for agents). Role contracts bind either way: the `qa` provider receives only the PRD plus the test-location summary (isolation), builders never open PRs, reviewers return a verdict plus findings.

## Resolution (run at Stage 1)

For each role, build an ordered **candidate list**: the configured value (a single name becomes a one-item list; `off`/`none` disables the stage), then append the built-in default as the final fallback. Drop candidates that are not installed. Then select:

- **`--auto` mode:** use the first installed candidate.
- **Gated mode:** if more than one candidate is installed, present the options at Checkpoint 1 and let the human pick (default: the first); if only one is installed, use it silently.

If no candidate is installed, apply the stage's own skip/degrade rule. `design_review`, `qa`, `code_review`, and `tech_spec_review` are optional (skip with a log); `prd_author`, `prd_review`, `tech_spec`, `backend`, `frontend`, and `open_pr` are required for the tracks that use them (stop with a clear message if missing). `tech_spec` also carries its own Stage 4 skip condition (`needs_prd` false), so a trivial task bypasses it regardless of provider; `tech_spec_review` runs only when `tech_spec` produced a spec, and fails open (skip with a log) when disabled or uninstalled.

Store the **selected** provider per role in `stage_plan.providers`. When a role has more than one installed candidate, show the candidate list at Checkpoint 1 so the choice is visible and overridable before the run.

## Extending the pipeline (the rest of the `dev` block)

Providers swap the built-in stages. Two further keys make the pipeline extendable without editing the orchestrator. All keys are optional; anything unset uses the built-in behavior. Repo-level config; in workspace mode the workspace-root config applies to every member, and a member's own block overrides it.

```yaml
dev:
  providers: { ... } # per-stage swaps (above)
  defaults: # team defaults seeded into the stage_plan
    review_depth: standard # none | scan | standard | full
    mode_per_track: { backend: full, frontend: quick }
    needs_qa_tests: true # pin instead of classifying
    needs_design_review: false
  hooks: # extra providers at stage boundaries
    pre-author-prd: [team:requirements-interview]
    post-prs: [team:ticket-sync, { name: team:staging-deploy, gating: true }]
```

**`defaults`** seed the classifier's output: where a key is set it replaces the classified value in the `stage_plan`, still human-overridable at Checkpoint 1. Teams pin house rules without touching any skill.

**`hooks`** attach extra skills/agents at any stage boundary, which is how capabilities the built-in pipeline does not have (ticket status sync, a requirements interview before PRD authoring, a deploy step after PRs, run tracing) plug in later:

- Keys are `pre-<stage>` and `post-<stage>` for any stage name (`author-prd`, `review`, `implement`, `test`, `prs`, `final-gate`, `learnings`).
- Each entry is a skill/agent name (dispatched by kind, like providers), invoked with the session context: the session-file path, `stage_plan`, `prd_path`, and collected PR URLs.
- Hooks are **non-blocking by default**: a failure is logged and the pipeline continues. An entry written as `{ name: <provider>, gating: true }` becomes a gate: its failure pauses the run in gated mode and leaves the PR a Draft with a note under `--auto`.
- Hooks that are not installed are skipped with a log. Resolved hooks are listed at Checkpoint 1 alongside providers.
