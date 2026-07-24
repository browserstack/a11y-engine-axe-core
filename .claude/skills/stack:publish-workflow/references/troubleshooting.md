# Troubleshooting

Common failure modes by step. Quick fixes only — escalate anything not listed.

| Issue | Fix |
|-------|-----|
| **Step 1** | |
| `npm install` fails in `a11y-engine-core` | Ensure Node 18.x is active (`nvm use 18.20.4`). |
| **Step 2** | |
| `consolidated_rules.json` missing or empty | Verify engine version was updated in `package.json` before running the script. |
| Pre-commit hook fails in accessibility repo | Use `--no-verify` — safe for JSON-only commits. |
| `RULES_FILE` causes Jenkins failure | Filename only (e.g., `a11y_engine_6.3.1-stag-23042026-1.json`), not a path like `db/rules/...`. |
| Rules file already exists | Ask user: overwrite or skip. |
| **Steps 3 & 4** | |
| `pnpm install` fails | Run `nvm use` first. Frontend repo requires Node 22.x (see `.nvmrc`). Full nvm init: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use`. |
| `node: command not found` in shell | nvm is not initialized. Use the full init command above. |
| Merge conflict in `package.json` (engine version) | Expected when branch has a different staging version than master. Resolve by setting `@browserstack/a11y-engine-core` to the new `<ENGINE_VERSION>`. |
| Merge conflict in other non-lock files | Stop — ask user to resolve manually. Do not auto-resolve. |
| `git merge --continue` fails with pre-commit hook | Frontend pre-commit hook checks Node version. Use `git commit --no-verify --no-edit` instead of `git merge --continue`. |
| `git merge --continue --no-edit` errors | `--continue` does not accept `--no-edit`. Use `git commit --no-verify --no-edit` after staging resolved files. |
| Branch lock file not generated after `pnpm install` | Verify pnpm version matches repo requirements (`packageManager` field in root `package.json`). |
| `@browserstack/a11y-engine-core-at` was modified | Revert immediately. Only `@browserstack/a11y-engine-core` should be updated. Applies to `apps/accessibility-toolkit/package.json` only. |
| Jenkins `BUILD_ENV` default is `production` | **Must change** to `preprod`/`regression`. Never submit with `production` for staging tests. |
| Jenkins `BRANCH_NAME` default is `master` | **Must change** to your feature branch. |
| **Step 5** | |
| Deployment not happening | Manual step — remind user to coordinate with stakeholders. |
| **Step 6** | |
| Scanner version not found in Slack | Check `#accessibility-qa-staging-deploys` for messages from minion. The automated extension build (A11yUploadExtension) posts this message after completion. If missing, the build may still be running — check the Jenkins link from Step 4. |
| Slackbot DM shows FAILED for BuildProductTools | Check the Jenkins console output for the failed build number. Common causes: branch not found, build env typo, npm registry issues. |
| Bot message text empty in Slack API | Bot messages use attachments/blocks that may not render as text via the API. Check in Slack desktop app or open the message permalink in browser. |
| Wrong scanner version used | Scanner version is the `Version` field from Slack (e.g., `4.47.0.0-preprod-1776940760`), NOT the engine version (`6.3.1-stag-23042026-1`). |
| `PROFILE` value for regression | Use `reg`, **not** `regression`. For preprod use `preprod`. |
| Accidentally checked `notifyA11y` | Notifies the entire A11y QA team on Slack. Only check `notifyme`. |
| Form resets between builds | Expected Jenkins behavior. Re-enter all parameters (`PROFILE`, `EXECUTION`, `SCANNER_VERSION`) and re-check `notifyme` for each build. |
| **General** | |
| Jenkins "Build with Parameters" not visible | Confirm you are logged into minion.browserstack.com. |
| Push rejected | Confirm you're not pushing to `main`/`master`. Pull latest and retry. |
| Jenkins build fails with branch not found | Run `git ls-remote --heads origin <BRANCH>` to verify the branch exists on remote. |
| Slack redirect opens desktop app instead of browser | Expected when clicking Slack links in Chrome. Use the Slack API or desktop app to read messages. |
