# Stage plan and session state

## stage_plan (emitted at intake, shown at Checkpoint 1, every field overridable)

```yaml
stage_plan:
  mode: single-repo | workspace-root
  needs_prd: true | false
  review_depth: none | scan | standard | full
  tracks: [backend?, frontend?]
  mode_per_track: { backend: full | quick, frontend: full | quick }
  needs_design_review: true | false   # FE touches rendered surfaces AND stack:design-review installed
  needs_qa_tests: true | false        # change has testable behavior worth spec-derived QA tests
  repos_touched: [<repo-or-member>, ...]
  checkpoints: gated | auto
  providers:                          # selected provider per role (see references/providers.md). dev.providers in bstack-ai-harness.yml may set a name, a priority list, or off; this stores the chosen one
    prd_author: stack:prd-create
    prd_review: stack:prd-review
    tech_spec: stack:tech-spec
    tech_spec_review: stack:tech-spec-review
    backend: stack:backend-builder
    frontend: stack:intake
    qa: stack:qa-test-author
    design_review: stack:design-review
    open_pr: stack:open-pr
    code_review: stack:pr-review      # workspace-root mode defaults to stack:workspace-pr-review
```

## Classification signals (how the plan is derived)

- Input richness: one-liner vs Jira key (fetch via Atlassian MCP) vs full PRD doc/URL.
- Scope and size: typo/config one-liner -> skip PRD + review; small feature -> quick; substantial or multi-surface -> full.
- Surfaces touched: frontend paths/repos -> frontend track (Plumb); backend/infra/library -> backend track; both -> both.

## session-state file (authoritative, enables resume)

Path: `.claude/dev/sessions/<session-id>.json`

```json
{
  "session_id": "<id>",
  "input": "<original raw input>",
  "stage_plan": { },
  "prd_path": "<path or null>",
  "tech_spec_path": "<path or null>",
  "tech_spec_review_path": "<path or null>",
  "modules": [
    { "path": "<repo-or-subpath>", "contributor": "<covering skill name | stack:dev-architect | plumb-deferred>" }
  ],
  "engine": "superpowers | self-contained | pending-restart",
  "design_review_verdict": "approve | comment | request-changes | critical | skipped-logic-only | skipped-not-installed | not-run | null",
  "completed_stages": ["intake", "author-prd", "review", "tech-spec", "..."],
  "rework": [
    {
      "finding": "<one-line summary of the late finding>",
      "source": "qa-triage | design-review | code-review | checkpoint",
      "level": "spec | architecture",
      "reopened_stages": ["author-prd", "review", "implement", "..."],
      "resolution": "rework | fix-in-place-artifact-amended | accepted-as-is"
    }
  ],
  "learnings": [
    { "text": "<one learning>", "target_stack": "domain|lang|workspace|org", "rationale": "<one line>" }
  ]
}
```

`modules` is populated by `stack:tech-spec` at Stage 4 (see `stack:dev/SKILL.md`): one entry per module it discovered from `stage_plan.repos_touched` (after its subdivision pass), each with the `contributor` that actually produced its content: a covering team tech-spec skill, `stack:dev-architect`, or `plumb-deferred` (a frontend module whose design is owned by Plumb at Stage 5). `tech_spec_path` is always a local path (even when a single-source team skill also published elsewhere) and is `null` only when Stage 4 is skipped (same trivial-task condition as `needs_prd`). It is written immediately upon producing the Tech Spec, before Checkpoint 4. `tech_spec_review_path` is the path to the Tech Spec review report written by `stack:tech-spec-review` (the Stage 4 review sub-step); it is `null` when the review is skipped (the `tech_spec_review` role is `off` or not installed, or Stage 4 itself is skipped).

## design_review_verdict (set in Stage 7, read at the Stage 8 gate)

Records the outcome of design-review so the Stage 8 gate can tell "not needed" from "needed but never ran". Written to the session file in Stage 7 before `prs` is added to `completed_stages`; `null` until then.

| Value | Meaning |
|---|---|
| `approve` | Design-review ran, approved |
| `comment` | Design-review ran, non-blocking comments only |
| `request-changes` | Design-review ran, blocking |
| `critical` | Design-review ran, critical / blocking |
| `skipped-logic-only` | Legitimate skip: no rendered surfaces touched |
| `skipped-not-installed` | Legitimate skip: `stack:design-review` unavailable AND the Stage 1 machine-local design-module install (`ai-harness add design --scope local`) failed; absence alone is not a skip |
| `not-run` | Required (`needs_design_review: true`) but no verdict collected: a blocker at Stage 8, never a pass |

## Rework records (late upstream findings)

`rework[]` is the audit trail for the "Late feedback and rework" mechanism in `stack:dev/SKILL.md`. When a post-implementation finding is classified as spec-level or architecture-level and the human approves rework, the orchestrator appends a record, then removes the reopened stages from `completed_stages` so the resume rule re-runs them for the delta. The record is append-only (it survives the re-run); at most 2 rework records with `resolution: rework` per run.

## Resume rule

On re-invocation `stack:dev` reads the session file (newest under `.claude/dev/sessions/`), and continues from the first stage NOT in `completed_stages`. PRD and code already live on the branch, so resume re-runs nothing already done. Stages removed from `completed_stages` by a rework record are re-run like any other incomplete stage, scoped to the reworked delta.

## Session-file write snippet (canonical, reused at every stage exit)

```bash
node -e '
const fs=require("fs"),path=process.argv[1],stage=process.argv[2];
const f=fs.readFileSync(path,"utf8"),j=JSON.parse(f);
if(!j.completed_stages.includes(stage))j.completed_stages.push(stage);
fs.writeFileSync(path,JSON.stringify(j,null,2));
' "$SESSION_FILE" "<stage-name>" || true
```
