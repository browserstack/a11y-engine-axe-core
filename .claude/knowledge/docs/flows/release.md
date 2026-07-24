# Release Flow Internals

Script: `scripts/bumpA11yEngine.sh`.

> `CLAUDE.md` and the script's own header comment refer to `bumpWebA11y.sh`. That filename no longer exists — only `bumpA11yEngine.sh` ships. Use what's on disk.

## What the script does — 7 stages

| # | Stage | Effect |
|---|---|---|
| 1 | Input | Prompts for new version, publish y/n, build set (WA / AUT / both), target environments (`reg`, `preprod`, `daily-reg`, `prod`) |
| 2 | Publish `a11y-engine-core` | Bumps `a11y-engine-core/package.json`, commits + pushes, triggers Jenkins `A11yEngineProductionPackagePublish` or `A11yEngineStagingPackagePublish` |
| 3 | Consolidate rules | Runs `a11y-engine-core/build/scripts/consolidate_rules.js` → writes `a11y-engine-core/consolidated_rules.json` |
| 4 | Copy rules to `accessibility` | `accessibility/db/rules/a11y_engine_${VERSION}.json` (sibling repo, via `gh` CLI) |
| 5 | Upload rules | Triggers Jenkins `A11yUploadRules` per environment |
| 6 | Build extension | Triggers Jenkins `BuildProductTools` for WA and/or AUT per environment |
| 7 | Upload extension | Triggers Jenkins `A11yUploadExtension` for each successful AUT build, then opens PRs in `frontend` and `accessibility` repos via `gh pr create` |

## Files touched

**In this repo:**
- `a11y-engine-core/package.json` (version bump)
- `a11y-engine-core/package-lock.json`
- `a11y-engine-core/consolidated_rules.json` (regenerated)

**In sibling repos (via `gh`):**
- `accessibility/db/rules/a11y_engine_${VERSION}.json` (new file per release)
- `frontend/apps/accessibility-toolkit/package.json` (version bump)
- `frontend/apps/accessibility-toolkit-headless/package.json` (version bump)

## Jenkins jobs triggered

| Job | Trigger | Purpose |
|---|---|---|
| `A11yEngineProductionPackagePublish` | Stage 2 (prod) | Publishes `@browserstack/a11y-engine-core` npm package |
| `A11yEngineStagingPackagePublish` | Stage 2 (staging) | Staging package publish |
| `A11yUploadRules` | Stage 5 | Uploads consolidated rules JSON to a CDN / service |
| `BuildProductTools` | Stage 6 | Builds WA / AUT extension artifacts |
| `A11yUploadExtension` | Stage 7 | Uploads extension builds to distribution |

## Pre-reqs

- VPN for Vault (if re-fetching secrets)
- `gh` CLI authenticated against `browserstack` org
- `nvm use 18.20.4` before running
- Clean working tree on `main` for `a11y-engine-core` (the script does `git commit` + `git push`)
- Jenkins token in `keys.yml` (`jenkins.username`, `jenkins.token`)

## Side scoping and per-env failure semantics

- The script derives the active sides from `BUILD_SET`. A WA-only `BUILD_SET` skips every AUT step (FE branch, build, upload, PR); AUT-only is symmetric. AT-only bump (mode 3) always skips AUT.
- Per-env failures (one Jenkins job, one branch push, one trigger) are non-fatal — they accumulate into a final summary so only the failed entries need to be re-run.
- Dependent steps are skipped when their upstream fails: a failed accessibility branch push blocks all rules-upload envs; a failed WA frontend branch blocks WA builds; a failed build blocks its upload.
- Fatal aborts are reserved for global prerequisites: engine version bump, `npm install`, `a11y-engine-core` commit/push, NPM publish, missing configs/credentials, missing repos.
- Exit code is non-zero if any failures OR blocked steps were recorded — CI cannot infer success from a green log alone.

## Semver coupling

Per AllyEngine versioning (https://browserstack.atlassian.net/wiki/spaces/ENG/pages/4108092131) — per Confluence, not verified in code:

- **Major** — axe-core major/minor upgrade OR major engine change (e.g., AI integration)
- **Minor** — new WCAG technique / success criterion, axe-core patch, major enhancement
- **Patch** — bug fixes, rollbacks, minor enhancements, experimental → stable transitions
- **`-AT` suffix** — AT-only releases (semver pre-release marker, excluded from this scope)

Release notes go out for major/minor; patches don't require a changelog entry.

## See also

- `versioning.md` — in-repo rule / commons versioning (distinct from package version).
- `knowledge/DEPLOYMENT.md` — checklist for running the release.
- `CLAUDE.md` — build and test commands to run pre-release.
