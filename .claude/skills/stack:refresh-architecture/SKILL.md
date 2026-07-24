---
name: stack:refresh-architecture
description: Detect drift in `.claude/knowledge/docs/flows/` docs against the codebase since the last refresh, propose edits, and re-anchor the doc set. Triggers&colon; "refresh architecture", "update arch docs", "check architecture drift".
---

# refresh-architecture &mdash; Anchored doc drift detector

Re-verifies `.claude/knowledge/docs/flows/*.md` against the code that has changed since `.claude/knowledge/docs/flows/.last-refresh`. Proposes (does not silently apply) edits. Humans review; on accept, re-anchors the SHA.

## Preconditions

- Clean repo. Uncommitted changes in the allowlist confuse `git diff` &mdash; ask the user to stash or commit first.
- `.claude/knowledge/docs/flows/.last-refresh` exists and contains a single commit SHA reachable from `HEAD`.

## Workflow

### 1. Anchor

Read `.claude/knowledge/docs/flows/.last-refresh`:

```
SHA=$(cat .claude/knowledge/docs/flows/.last-refresh | tr -d '[:space:]')
git merge-base --is-ancestor "$SHA" HEAD || fail "anchor SHA is not in current history"
```

If the anchor is missing, ask the user. **Do not guess a SHA.** The correct first run is the commit at which the architecture dir was created.

### 2. Structural diff

Use the allowlist in `references/path-allowlist.md`. Show:

```
git log --stat "$SHA"..HEAD -- <allowlist paths>
git diff --name-status "$SHA"..HEAD -- <allowlist paths>
```

Group changed paths by the architecture file they most likely affect:

| Changed area | Likely-affected arch file(s) |
|---|---|
| `a11y-engine-core/lib/rules/**`, `lib/checks/**` | `rule-types.md` |
| `ip-protection/worker/**`, `worker.js`, `aiWorker.js`, `utils/bullmq.js` | `workers.md`, `rule-types.md`, `scan-lifecycle.md` |
| `ip-protection/routes/**`, `controllers/**` | `scan-lifecycle.md` |
| `ip-protection/app.js` (socket handlers) | `socket-protocol.md` |
| `ip-protection/utils/middleware.js` | `auth.md` |
| `ip-protection/config/constants.js` | `storage.md`, `auth.md` (TTLs, tokens) |
| `ip-protection/commons/v2/**`, `checks/combined-rules/**`, `worker/combined-rules-class-*.js` | `versioning.md` |
| `dom-forge-core/percy/**`, `lib/core/**` | `dom-capture.md` |
| `scripts/bumpA11yEngine.sh` | `release.md` |
| `ip-protection/utils/logger.js`, `eds-utils.js` | `observability.md` |

If a change lands in an allowlisted path not in this table, flag it as **"needs human judgement"** — don't assume it only affects one file.

### 3. Path-existence canary

Even when step 2 is empty, file paths cited in docs can rot due to renames in non-allowlisted paths. Run:

```
# Extract every file-path token from architecture docs
grep -hoE '[a-zA-Z][-_a-zA-Z0-9/]+\.(js|json|md|sh|yml)' .claude/knowledge/docs/flows/*.md \
  | sort -u
```

For each extracted path, `test -e "$PATH"`. Collect misses. Any miss is **critical drift** — the docs point at something that no longer exists.

### 4. Report

Print a single report with three sections:

```
## Architecture drift report — <SHA>..<HEAD>

### Structural changes
<file path>  <+lines / -lines>   → suggests updating <arch-file.md>

### Dead paths (cited in docs, not found on disk)
<arch-file.md>: path `<broken-path>`  (last known line: <N>)

### No-change sanity
Files with zero allowlisted changes: <count>/<total>
```

Stop here. Do not edit yet.

### 5. Propose edits

For each affected arch file, open it, read the relevant source changes, and propose a diff. Keep edits minimal:

- Rename-only changes: one-line substitutions.
- Table additions (new worker, new queue, new route): add one row to the existing table, don't restructure.
- Deletions (worker removed): remove the row, don't rewrite surrounding prose.
- New concepts that don't fit any existing arch file: propose a **new** arch file in the same pointer-heavy style, and add an entry to `README.md`. Do not dump into a random file.

Show each proposed edit as a diff and wait for approval.

### 6. Re-anchor

After the user accepts the edits (all or some):

```
git rev-parse HEAD > .claude/knowledge/docs/flows/.last-refresh
```

Commit separately from the doc edits so the anchor update is reviewable on its own. Suggest a commit message like:

```
docs(architecture): refresh against <new-HEAD>
```

## Hard rules

- **Do not auto-commit edits.** Every diff is human-reviewed.
- **Do not rewrite prose that hasn't drifted.** If a table row is stale, fix the row; don't restructure the file. Rewrites lose the shape future readers rely on.
- **Never delete `.last-refresh`.** If its SHA is unreachable (history rewrite), ask the user for a new anchor — don't silently re-seed to `HEAD` (that would hide drift).
- Respect the path allowlist. A change in `test/` or `README.md` is not drift. If the user wants to broaden the allowlist, have them edit `references/path-allowlist.md` explicitly.
- Keep the doc style: tables, file paths, dispatch fn names. Don't add narrative.

## Operating notes

- Cost: one pass is linear in allowlist diff size. For gaps > 2 months, expect 5-10 min of reading + proposing.
- If the path canary reports dead paths **and** step 2 is empty, that's a rename in a non-allowlisted file the allowlist missed. Consider widening the allowlist.
- If two arch files disagree after drift (e.g., `workers.md` lists a queue `scan-lifecycle.md` doesn't), surface the inconsistency in the report.

## References

- `references/path-allowlist.md` — structural paths that trigger review
