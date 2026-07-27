# Bulk PR mechanics — find/create fixes and combine (merge method)

Two repos are involved:

- `browserstack/a11y-engine` — the main repo.
- `browserstack/a11y-engine-axe-core` — the submodule, mounted at `axe-core/` inside a11y-engine.

`<DATE>` below is `$(date +%Y%m%d)`. Before any `npm`, select **each repo's own** Node: `nvm use` reading its
`.nvmrc` if present, else `nvm use 18.20.4` (a11y-engine's pin — the axe-core fork may differ, so don't assume).

**Branch idempotency.** Both bulk branches are named `security/dependabot-bulk-<DATE>`. Before creating one,
check it doesn't already exist (a same-day re-run or a partial earlier failure):
`git rev-parse --verify --quiet "security/dependabot-bulk-<DATE>"` or `git ls-remote --exit-code origin
"security/dependabot-bulk-<DATE>"`. If it exists, **reuse** it (continue merging into it) or append `-2`,
`-3`; never let `git checkout -b` fail silently mid-run.

> **Combine strategy = merge the Dependabot branches (method B).** We reuse Dependabot's exact, tested diff
> and pull each PR branch into a bulk branch, rather than re-deriving bumps. So Phase 3 must guarantee every
> in-scope ticket has a real PR branch first.

## Ensure a fix PR (Phase 3)

For each curated ticket, work in the correct repo (from `references/jira.md` § scope).

### 1. Find the existing Dependabot PR

```bash
# PKG, TARGET, and DIR come from the parsed ticket (Package, target version, dir of Package File).
gh pr list --repo "$REPO" --author "app/dependabot" --state open \
  --json number,title,headRefName,url --limit 100 \
  --search "$PKG in:title"
```

Match a PR when its title is `…bump <PKG> from <X> to <Y>…` with `Y == TARGET` (or newer) **and** the
directory matches — Dependabot encodes the dir in the title (`… in /<dir>`) and in the branch name
(`dependabot/npm_and_yarn/<dir>/<pkg>-<version>`). Cross-check against the Dependabot PR URL parsed from the
ticket. Record `headRefName` (the branch to merge later) and the PR number.

> A single `PKG`/`TARGET` may have several PRs across directories (root, `ip-protection`, `test/examples/…`).
> Match the one whose dir equals the ticket's Package File dir. Different-dir PRs belong to different tickets.

### 2. If no PR exists, create the bump

```bash
DEFAULT_BRANCH=$(gh repo view "$REPO" --json defaultBranchRef -q .defaultBranchRef.name)  # main (a11y-engine); resolve per repo
git fetch origin
git checkout -b "security/${PKG}-${TARGET}" "origin/${DEFAULT_BRANCH}"
cd "$DIR"                                                                # dir containing the affected package.json/lock
```

Apply the bump, matching how the dependency is declared:

- **Direct dependency** (listed in that `package.json`): `npm install "${PKG}@${TARGET}"` (respect the
  existing range style; don't add `--save-exact` unless the file already pins exact versions).
- **Transitive only** (present in `package-lock.json` but not `package.json`): first try
  `npm install "${PKG}@${TARGET}"`; if the lock doesn't move because a parent pins it, add an `overrides`
  entry to that `package.json` and reinstall:

  ```jsonc
  // package.json
  "overrides": { "<PKG>": "<TARGET>" }
  ```

  ```bash
  npm install
  ```

Verify and open the PR:

```bash
npm ls "$PKG"            # confirms the resolved version is >= TARGET everywhere in this tree
cd -                     # back to repo root
git add -A
git commit -m "chore(deps): bump ${PKG} to ${TARGET} (<AXE-KEY>)"
git push -u origin "security/${PKG}-${TARGET}"
gh pr create --repo "$REPO" --base "$DEFAULT_BRANCH" \
  --title "chore(deps): bump ${PKG} to ${TARGET}" \
  --body "Resolves <AXE-KEY>. Advisory: <advisory-url>. CVSS <n>."
```

You now have a PR + branch for every ticket. `stack:submit-pr` may be used instead of the raw `gh pr create`
if you want its pre-flight; the raw form is fine here since the bulk PR is where review actually happens.

## Build bulk PRs (Phase 4)

### 4a. axe-core bulk PR (only if axe-core tickets are in scope) — do this FIRST

Operate in the `a11y-engine-axe-core` repo. Prefer a **standalone clone** you own push access to. If you use
the `axe-core/` submodule working tree instead, initialise it and confirm its push remote first:

```bash
git submodule update --init axe-core        # from the a11y-engine root, if using the submodule tree
git -C axe-core remote -v                    # confirm 'origin' points at a fork you can push to
```

Then build the bulk branch:

```bash
AXE_DEFAULT=$(gh repo view browserstack/a11y-engine-axe-core --json defaultBranchRef -q .defaultBranchRef.name)
git fetch origin
git checkout -b "security/dependabot-bulk-<DATE>" "origin/${AXE_DEFAULT}"   # honour branch idempotency (above)
for BR in $AXE_CORE_DEPENDABOT_BRANCHES; do
  git merge --no-edit "origin/${BR}" || resolve_lockfile_conflict   # see below
done
git push -u origin "security/dependabot-bulk-<DATE>"
gh pr create --repo browserstack/a11y-engine-axe-core --base "$AXE_DEFAULT" \
  --title "chore(deps): bulk Dependabot security bumps (<DATE>)" \
  --body "Bulk security bumps. Resolves: <AXE keys>."
AXE_CORE_BULK_SHA=$(git rev-parse HEAD)   # PRE-MERGE branch head — used for review only; re-point after merge (Phase 8)
```

> **`AXE_CORE_BULK_SHA` is the unmerged branch tip.** It is fine for the a11y-engine PR's _review_ pass, but
> if the axe-core PR later squash/rebase-merges, its default branch gets a **different** commit. So the
> submodule must be **re-pointed at the merged commit before the a11y-engine bulk PR merges** — see Phase 8
> ordering in SKILL.md. Never leave a11y-engine pointing at a commit that isn't on axe-core's default branch.

### 4b. a11y-engine bulk PR

Operate in the `a11y-engine` repo root.

```bash
git fetch origin
git checkout -b "security/dependabot-bulk-<DATE>" origin/main
for BR in $A11Y_ENGINE_DEPENDABOT_BRANCHES; do
  git merge --no-edit "origin/${BR}" || resolve_lockfile_conflict
done
```

If Phase 4a ran, point the submodule at the axe-core bulk commit **for the review pass** (Phase 8 re-points it
to the _merged_ commit before this PR merges — see the 4a caveat above):

```bash
git -C axe-core fetch origin
git -C axe-core checkout "$AXE_CORE_BULK_SHA"
git add axe-core
git commit -m "chore(deps): point axe-core submodule at security bulk (<DATE>)"
```

Push and open the PR, linking everything:

```bash
git push -u origin "security/dependabot-bulk-<DATE>"
gh pr create --repo browserstack/a11y-engine --base main \
  --title "chore(deps): bulk Dependabot security bumps (<DATE>)" \
  --body "$(cat <<'EOF'
## Summary
Bulk resolution of open Dependabot security tickets, combined for a single review + test pass.

## Resolves
<AXE-XXXX list, one per line, with package@version>

## Included Dependabot PRs
<links to the individual a11y-engine dependabot PRs merged in>

## axe-core submodule
Pointer bumped to a11y-engine-axe-core#<axe-core bulk PR> (<short SHA>).  <!-- omit if 4a didn't run -->

## Testing
- [ ] RUN_CHECKS (lint) green
- [ ] RUN_UNIT_TESTS green
- [ ] stack:code-review clean
EOF
)"
```

## resolve_lockfile_conflict

Merging multiple Dependabot branches conflicts almost only in lockfiles. **Never blanket `--ours` a
`package.json`** — that silently discards the incoming branch's version bump. Resolve by keeping _both_ deps'
intent in `package.json`, then regenerate the lock:

```bash
# 1. package.json conflicts (rare — only when two branches edit the same manifest):
#    hand-merge the conflict markers so BOTH bumped versions/overrides are kept. Do not drop either side.
$EDITOR <conflicted-package.json>      # or resolve the <<<<<<< / ======= / >>>>>>> hunks in place

# 2. package-lock.json conflicts (common): don't hand-edit — regenerate from the merged package.json.
( cd "$(dirname <conflicted-lockfile>)" && npm install )   # produces a clean lock consistent with both bumps
git add -A
git commit --no-edit
```

Verify after **all** merges: `npm ls <pkg>` for each bumped package shows a version `>= TARGET` (no
lower-version dedupe survived), and — if 4a ran — `git submodule status` shows `axe-core` at the intended SHA.

## Notes

- **Never** push, create PRs, or commit in `dry-run` — report the branches that would be merged and the
  resulting bulk-PR shape instead.
- Keep the individual Phase-3 PRs open until the bulk PR merges; they're the audit trail. They can be closed
  (superseded by the bulk PR) once it lands, or left for Dependabot to auto-close when the bump is detected.
- Blast radius per bump comes from the lockfile directory — see `references/risk-classification.md`.
