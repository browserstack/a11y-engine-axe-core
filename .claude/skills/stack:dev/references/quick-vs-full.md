# Quick vs full, per track

| Track | Full | Quick (small tasks) |
|---|---|---|
| Backend | superpowers writing-plans -> executing-plans + TDD + requesting-code-review (or self-contained equivalent) | skip the formal plan doc: one focused red-green-refactor TDD pass + a light self-review (the "quicker superpowers") |
| Frontend | Plumb full chain (`ui-new`) | Plumb `ui-modify` / `logic-only` (already skip variations/pick-component/scaffold) |
| PRD | author + standard/full review | short PRD + quick-scan review, or skip both for trivial |

## Superpowers preflight (run by the orchestrator at Stage 0, the very beginning)

`stack:dev` runs this at Stage 0, resolves an `engine` value, then hands it to `stack:backend-builder`. The builder detects and installs nothing: it runs the engine it is given.

1. Detect: `claude plugin list` (or read `~/.claude/plugins/installed_plugins.json`) for key `superpowers@claude-plugins-official`.
2. Present and live in-session -> `engine=superpowers`.
3. Absent -> install: `claude plugin marketplace add claude-plugins-official` (only if marketplace unknown), then `claude plugin install superpowers@claude-plugins-official`.
4. A fresh install applies next session. Gated: HALT — end the turn; do not run Stage 1 or fold this into Checkpoint 1. Prompt the user to restart (or reload plugins) and re-invoke `stack:dev`; the run continues only in the new session. On re-invocation, re-detect and set `engine=superpowers`; set `engine=self-contained` only if the user explicitly declines. --auto: `engine=self-contained` this run.
5. Install failure (offline, restricted) -> `engine=self-contained`, record the failure.
