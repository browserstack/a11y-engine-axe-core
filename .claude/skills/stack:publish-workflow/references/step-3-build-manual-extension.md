# Step 3 — Build Manual Extension

> Skip this step if user selected `automated` only.

Reads params: `<FRONTEND_REPO>`, `<MANUAL_BRANCH>`, `<ENGINE_VERSION>`, target environments.

## 3.0 Stash and record current branch

```bash
cd <FRONTEND_REPO>
ORIGINAL_BRANCH=$(git branch --show-current)
git stash
```

## 3.1 Prepare branch

**New branch:**

```bash
git checkout master && git pull origin master
git checkout -b <MANUAL_BRANCH>
```

**Existing branch:**

```bash
git checkout <MANUAL_BRANCH>
git pull origin <MANUAL_BRANCH>
git merge master
```

**Handling merge conflicts:**

- Conflict in `pnpm-lock.yaml` → `git checkout --theirs pnpm-lock.yaml && git add pnpm-lock.yaml`
- Conflict in `apps/accessibility-toolkit/package.json` on `@browserstack/a11y-engine-core` version → resolve by setting it to `<ENGINE_VERSION>` (the value you're about to set anyway). Expected when the branch already has a different staging version than master.
- Conflict in **any other file** → stop and ask the user to resolve manually.

After resolving all conflicts:

```bash
git add <resolved-files>
git commit --no-verify --no-edit
```

> **Why not `git merge --continue`?** The frontend repo's pre-commit hook checks the Node version. If nvm has a different version active (e.g., Node 18 from a previous step), `git merge --continue` will fail because it runs the hook. Using `git commit --no-verify --no-edit` bypasses this. The `--continue` flag also does not accept `--no-edit` as an argument.

## 3.2 Update engine version

Edit `apps/accessibility-toolkit/package.json` — update **only** the `"@browserstack/a11y-engine-core"` version to `<ENGINE_VERSION>`. If this was already set during merge conflict resolution, verify the value is correct and skip this step.

> **Critical:** Do **NOT** modify `@browserstack/a11y-engine-core-at`. It is a separate package alias and must remain unchanged.

## 3.3 Install dependencies

Frontend monorepo requires Node 22.x via nvm and pnpm exclusively. Never use npm.

```bash
cd <FRONTEND_REPO>/apps/accessibility-toolkit
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && pnpm install
```

> Takes ~1 minute. Peer dependency warnings are expected and safe to ignore.

## 3.4 Handle the generated lock file

pnpm creates a new lock file named after the branch (e.g., `pnpm-lock.<MANUAL_BRANCH>.yaml`) in the repo root.

```bash
cp <FRONTEND_REPO>/pnpm-lock.<MANUAL_BRANCH>.yaml <FRONTEND_REPO>/pnpm-lock.yaml
```

## 3.5 Commit and push

```bash
cd <FRONTEND_REPO>
git add pnpm-lock.yaml apps/accessibility-toolkit/package.json
git commit --no-verify -m "chore: bump a11y-engine-core to <ENGINE_VERSION> in accessibility-toolkit"
git push origin <MANUAL_BRANCH>
```

> **Safety:** Never push to `main` or `master`.

## 3.6 Trigger Jenkins build (once per environment)

1. Open: <https://minion.browserstack.com/job/FrontendDeploys/job/BuildProductTools/build?delay=0sec>
2. Fill in the form:

| Field                    | Value                           | Notes                                                     |
| ------------------------ | ------------------------------- | --------------------------------------------------------- |
| `BUILD_TYPE`             | `CHROME_EXT`                    | Default — leave as-is                                     |
| `PRODUCT`                | `accessibility-toolkit`         | Dropdown                                                  |
| `REPO_NAME`              | `frontend`                      | Type in                                                   |
| `BRANCH_NAME`            | `<MANUAL_BRANCH>`               | Type in                                                   |
| `BUILD_ENV`              | `preprod` / `regression` / etc. | Default is `production` — **must change**. One per build. |
| `UPDATE_SUFFIX`          | **checked**                     |                                                           |
| `FULL_SUFFIX`            | unchecked                       |                                                           |
| `CUSTOM_SUFFIX`          | leave empty                     |                                                           |
| `A11Y_BASE_URL_OVERRIDE` | leave empty                     |                                                           |

3. Click **Build**. Note the build number and share the link.
4. Repeat for each environment.
