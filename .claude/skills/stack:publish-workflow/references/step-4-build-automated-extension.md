# Step 4 — Build Automated Extension

> Skip this step if user selected `manual` only.

Reads params: `<FRONTEND_REPO>`, `<AUTOMATED_BRANCH>`, `<ENGINE_VERSION>`, target environments.

## 4.1 Prepare branch

If coming from Step 3, switch branches first:

```bash
cd <FRONTEND_REPO>
git checkout master && git pull origin master
git checkout -b <AUTOMATED_BRANCH>
```

If using an existing branch:

```bash
git checkout <AUTOMATED_BRANCH>
git pull origin <AUTOMATED_BRANCH>
git merge master
```

**Handling merge conflicts** — same rules as Step 3:
- `pnpm-lock.yaml` conflict → `git checkout --theirs pnpm-lock.yaml && git add pnpm-lock.yaml`
- `apps/accessibility-toolkit-headless/package.json` conflict on `@browserstack/a11y-engine-core` version → resolve by setting it to `<ENGINE_VERSION>`.
- Any other file → stop and ask user.

After resolving: `git add <resolved-files> && git commit --no-verify --no-edit` (see Step 3 note on why not `git merge --continue`).

## 4.2 Update engine version

Edit `apps/accessibility-toolkit-headless/package.json` — update **only** `"@browserstack/a11y-engine-core"` to `<ENGINE_VERSION>`.

> **Note:** This package does NOT have `@browserstack/a11y-engine-core-at` — only the manual extension (`accessibility-toolkit`) has it.

## 4.3 Install dependencies

```bash
cd <FRONTEND_REPO>/apps/accessibility-toolkit-headless
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && pnpm install
```

## 4.4 Handle the generated lock file

```bash
cp <FRONTEND_REPO>/pnpm-lock.<AUTOMATED_BRANCH>.yaml <FRONTEND_REPO>/pnpm-lock.yaml
```

## 4.5 Commit and push

```bash
cd <FRONTEND_REPO>
git add pnpm-lock.yaml apps/accessibility-toolkit-headless/package.json
git commit --no-verify -m "chore: bump a11y-engine-core to <ENGINE_VERSION> in accessibility-toolkit-headless"
git push origin <AUTOMATED_BRANCH>
```

> **Safety:** Never push to `main` or `master`.

## 4.6 Trigger Jenkins build (once per environment)

1. Open: <https://minion.browserstack.com/job/QA/job/AccessibilityTeam/job/A11yUploadExtension/build?delay=0sec>
2. Fill in the form:

| Field | Value | Notes |
|-------|-------|-------|
| `ENVIRONMENT` | `preprod` / `regression` / etc. | Default is `regression` — change if needed. One per build. |
| `ENGINE_VERSION` | `<ENGINE_VERSION>` | Type in |
| `CREATE_EXTENSION` | **checked** | |
| `BRANCH_NAME` | `<AUTOMATED_BRANCH>` | Default is `master` — **must change** |
| `BUILD_PRODUCT_TOOLS_JOB` | leave empty | |
| `SET_LATEST` | `no` | Default — leave as-is |
| `SET_INTERNAL` | `no` | Default — leave as-is |
| `PRODUCT` | `automated_tests` | Default — leave as-is |
| `UPDATE_SUFFIX` | **checked** | |
| `FULL_SUFFIX` | unchecked | |
| `CUSTOM_SUFFIX` | leave empty | |

3. Click **Build**. Note the build number and share the link.
4. Repeat for each environment.

---

## Cleanup — Restore Frontend Repo

After Steps 3 and/or 4 are complete:

```bash
cd <FRONTEND_REPO>
git checkout <ORIGINAL_BRANCH>
git stash pop
```

Restores the user's working state from before the workflow.
