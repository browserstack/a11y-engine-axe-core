---
name: stack:publish-workflow
description: End-to-end workflow for publishing a11y-engine staging packages, uploading rules, building extensions, deploying, and running validation pipelines. Triggers&colon; "publish engine", "run publish workflow", "staging deploy".
argument-hint: "Run the a11y engine publish workflow"
---

# A11y Engine — End-to-End Publish Workflow

A repeatable workflow for publishing a new a11y-engine staging package, uploading rules, building extensions, deploying, and running validation pipelines.

> **Usage with Claude Code + Chrome:**
> 1. Log into [minion.browserstack.com](https://minion.browserstack.com) and [Slack](https://browserstack.enterprise.slack.com) in Chrome.
> 2. Open Claude Code with `--chrome` flag (or ensure Chrome MCP is connected).
> 3. Say: *"Run the a11y engine publish workflow"*.
> 4. Claude collects parameters then executes every step end-to-end.

## Overview

| Step | What | Jenkins Job | Auto? | Detail |
|------|------|-------------|-------|--------|
| **1** | Bump engine version, publish npm package | `A11yEngineStagingPackagePublish` | Yes | `references/step-1-publish-engine.md` |
| **2** | Consolidate rules, upload to environments | `A11yUploadRules` | Yes | `references/step-2-upload-rules.md` |
| **3** | Build manual extension (`accessibility-toolkit`) | `BuildProductTools` | Yes | `references/step-3-build-manual-extension.md` |
| **4** | Build automated extension (`accessibility-toolkit-headless`) | `A11yUploadExtension` | Yes | `references/step-4-build-automated-extension.md` |
| **5** | Deploy A11yEngine and Accessibility repos | — | Manual (user) | Inline below |
| **6** | Verify builds, get scanner version, run P0/P1 pipelines | `A11yEngineWebsiteStagingRunner` | Yes | `references/step-6-pipelines.md` |

**Dependencies:**
- Steps 3 & 4 require Steps 1 & 2 to succeed (green tick on Jenkins).
- Steps 3 & 4 are independent of each other and may run in any order.
- Step 5 is a manual gate requiring stakeholder alignment.
- Step 6 requires Steps 3, 4, and 5 to be complete.

**Repos:**

| Repo | Base branch | Node | Package manager |
|------|-------------|------|-----------------|
| `a11y-engine` | feature branches | 18.x (`nvm use 18.20.4`) | npm |
| `accessibility` | `main` | N/A (Ruby/Rails) | N/A |
| `frontend` | `master` | 22.x (reads `.nvmrc`) | pnpm 9.x (never npm) |

## Parameters (collected at start)

### For Steps 1 & 2

| # | Parameter | Example | Notes |
|---|-----------|---------|-------|
| 1 | **Engine version** | `6.3.1-stag-23042026-1` | Exact version string. Used everywhere. |
| 2 | **a11yEngine branch** | `ATA-941-add-subtype-to-eds-events` | Must already exist on remote. |
| 3 | **a11yEngine repo path** | `/Users/you/repos/a11y-engine` | Absolute path to local clone. |
| 4 | **Target environments** | `preprod`, `regression` | One or more. Each triggers a separate Jenkins build. |
| 5 | **Accessibility repo path** | `/Users/you/repos/accessibility` | Absolute path to local clone. |
| 6 | **Accessibility branch** | `dev-yourname-rules-upload` | Existing branch, or `create:<name>` to create from `main`. |

### For Steps 3 & 4 (collected after Steps 1 & 2 succeed)

| # | Parameter | Example | Notes |
|---|-----------|---------|-------|
| 7 | **Frontend repo path** | `/Users/you/repos/frontend` | Monorepo — uses `nvm` + `pnpm` exclusively (no npm). |
| 8 | **What to build** | `manual`, `automated`, or `both` | |
| 9 | **Manual extension branch** | `dev-yourname-wa-package` | Only if `manual` or `both`. Existing, or `create:<name>` from `master`. |
| 10 | **Automated extension branch** | `dev-yourname-aut-package` | Only if `automated` or `both`. Existing, or `create:<name>` from `master`. |

> If building both, **two separate branches** are required — one per extension type.

### For Step 6 (collected after Step 5 confirmed done)

| # | Parameter | Example | Notes |
|---|-----------|---------|-------|
| 11 | **Pipelines to run** | `p0`, `p1`, `wa_p0`, `prod_sanity_p0`, `ai_p0` | Multi-select. One Jenkins build per pipeline × environment. |

> The **scanner version** is NOT a user parameter — it is extracted from the `#accessibility-qa-staging-deploys` Slack channel during Gate Check 2.

## Execution flow

```
Step 1 (engine publish)  ──┐
                           ├─► Gate A: both green on Jenkins
Step 2 (rules upload)   ───┘
                              │
                              ▼
              Steps 3 & 4 (extension builds, parallel)
                              │
                              ▼
                        Cleanup frontend
                              │
                              ▼
                  Step 5 (manual deploy, user)
                              │
                              ▼
        Gate B: 3 checks (Slack DMs + #channel + Step 5 done)
                              │
                              ▼
                  Step 6 (P0/P1 pipelines)
                              │
                              ▼
                     Output checklist
```

## Gate A — Verify Steps 1 & 2 before triggering Steps 3/4 Jenkins builds

Open both Jenkins build links:
- **Package publish** build → must show green tick
- **Rules upload** build → must show green tick

If either is failed or still running, **do not trigger extension builds** — notify the user.

> **Parallelism note:** Code preparation for Steps 3/4 (branch checkout, version bump, `pnpm install`, commit, push) does **not** depend on Steps 1/2 and can proceed in parallel. Only the **Jenkins build triggers** (3.6 and 4.6) require the gate to pass.

Collect Step 3 & 4 parameters (7–10) at any point — independent of the gate.

## Step 5 — Deploy A11yEngine and Accessibility Repos (manual)

This is a **manual step** requiring stakeholder alignment. The user handles deployment.

Ask: *"Have the A11yEngine and Accessibility repos been deployed to `<ENVIRONMENT>`?"*

- If **yes** → proceed to Gate B + Step 6.
- If **no** → wait. Do not proceed until the user confirms deployment.

## Gate B — Verify Steps 3 & 4 (and 5) before running Step 6

Three checks, all required.

### Check 1 — Slackbot DMs for `BuildProductTools` (manual extension)

Open the DM from **Slackbot** in Slack. Look for messages about `FrontendDeploys/BuildProductTools` sent after the builds were triggered. Each success message shows:

```
FrontendDeploys/BuildProductTools
BUILD NUMBER #XXXX PASSED!
DEPLOYER: <username>
PARAMETERS: CUSTOM_SUFFIX -> , A11Y_BASE_URL_OVERRIDE -> , REPO_NAME
-> frontend, PRODUCT -> accessibility-toolkit, BUILD_ENV -> preprod,
UPDATE_SUFFIX -> true, FULL_SUFFIX -> false, BUILD_TYPE -> CHROME_EXT,
BRANCH_NAME -> <branch-name>.
```

- Any **FAILED** → notify the user and stop.
- All **PASSED** → continue.

> **How to check via Slack API:** Search DMs with Slackbot for `FrontendDeploys/BuildProductTools` filtered to today's date. Bot messages may not return text content via the API — if empty, check in Slack desktop or open the permalink.

### Check 2 — `#accessibility-qa-staging-deploys` channel (automated extension)

Search `#accessibility-qa-staging-deploys` for a message from **minion** about the automated extension upload:

```
A11y Extension uploaded successfully.
Version: <SCANNER_VERSION>,
Engine Version: <ENGINE_VERSION>,
Pod: <pod-name>,
Triggered By: @<username>
```

- Green checkmark → **success**. Extract the **Version** field — this is the **scanner version** (e.g., `4.47.0.0-preprod-1776940760`).
- Failure or missing → notify the user and stop.

> **Critical:** Scanner version is the `Version` field — **NOT** the Engine Version. These are different values. Step 6 uses the scanner version.

### Check 3 — Confirm Step 5 done

Ask the user if Step 5 (deployment) is complete before proceeding.

## Output checklist

Share with the user at the end of each phase.

### Steps 1 & 2
- [ ] Engine version bumped and pushed to `<A11Y_ENGINE_BRANCH>`
- [ ] Package publish build link (with build number)
- [ ] Rules file committed and pushed to `<ACCESSIBILITY_BRANCH>`
- [ ] Rule upload build link(s) — one per environment
- [ ] Accessibility repo restored to original branch

### Steps 3 & 4
- [ ] Manual extension version bumped on `<MANUAL_BRANCH>` (if applicable)
- [ ] Manual extension build link(s) — one per environment
- [ ] Automated extension version bumped on `<AUTOMATED_BRANCH>` (if applicable)
- [ ] Automated extension build link(s) — one per environment
- [ ] Frontend repo restored to original branch, stash popped

### Step 5
- [ ] User confirmed deployment is complete

### Step 6
- [ ] Scanner version extracted from Slack: `<SCANNER_VERSION>`
- [ ] Pipeline build link(s) — one per pipeline per environment

## See also

- `references/step-1-publish-engine.md` — version bump + package publish
- `references/step-2-upload-rules.md` — consolidate + upload rules per env
- `references/step-3-build-manual-extension.md` — `accessibility-toolkit` build
- `references/step-4-build-automated-extension.md` — `accessibility-toolkit-headless` build + cleanup
- `references/step-6-pipelines.md` — Jenkins pipeline parameters
- `references/troubleshooting.md` — failure modes and fixes per step
