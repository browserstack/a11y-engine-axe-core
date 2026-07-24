# Workspace detection and fan-out

## Detection (run at startup, Stage 0)

Read `./bstack-ai-harness.yml`:
- `workspace:` field present (or a `stack-workspace.yml` / `.claude/stack-workspace.yml` sits alongside) -> **workspace-root mode**.
- Otherwise (member repo or standalone repo) -> **single-repo mode**.

The CLI writes the `workspace:` field only into a workspace root's config (`cli/src/lib/config.ts`); member and standalone configs omit it. Detection is deterministic. Announce the detected mode at Checkpoint 1; allow `--workspace` / `--repo` override.

```bash
MODE=single-repo
if [ -f bstack-ai-harness.yml ] && grep -qE '^workspace:' bstack-ai-harness.yml; then MODE=workspace-root; fi
if [ -f stack-workspace.yml ] || [ -f .claude/stack-workspace.yml ]; then MODE=workspace-root; fi
echo "$MODE"
```

## Workspace-root behavior

Author + review the PRD once at the root. Route the backend track to backend member repo(s) and the frontend track to frontend member repo(s) from the workspace manifest + per-repo classification, in parallel. Open one Draft PR per touched member repo, cross-linked, plus a root summary. Ambiguous routing (a change that could land in two members) pauses for a human even under --auto.
