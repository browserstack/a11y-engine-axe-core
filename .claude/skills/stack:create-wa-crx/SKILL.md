---
name: stack:create-wa-crx
description: Build a WA (accessibility-toolkit) Chrome extension CRX for any environment (regression, preprod, local) and PR it to bstackautomation-helper. Covers frontend patching, build, CRX packing, naming, PR directories, and post-build restore. Pre-reqs&colon; engine published on npm, rules uploaded.
argument-hint: "<regression|preprod|local> <engine-version>"
---

# A1 — WA CRX Creation

Build the WebAccessibility (`accessibility-toolkit`) Chrome extension as a `.crx` file for a target environment, then PR it to the `bstackautomation-helper` repo so automation tests pick it up.

## Trigger conditions

- "build WA CRX", "create WA extension for regression", "pack CRX", "WA crx for preprod"
- After a publish workflow (engine on npm + rules uploaded) when the next step is building an extension CRX for automation

## Pre-requisites

1. **Engine version published on npm** — the target `@browserstack/a11y-engine-core` version must be live on the registry (Step 1 of `stack:publish-workflow`).
2. **Rules uploaded** to the target environment (Step 2 of `stack:publish-workflow`).
3. **Chrome installed** — `google-chrome` or `/Applications/Google Chrome.app` must be available for `--pack-extension`.
4. **Frontend repo cloned** — the monorepo containing `apps/accessibility-toolkit`.
5. **`bstackautomation-helper` repo cloned** — for the CRX PR.

## Parameters

| # | Parameter | Example | Notes |
|---|-----------|---------|-------|
| 1 | **Target environment** | `regression`, `preprod`, `local` | Determines build script + backend URLs |
| 2 | **Engine version** | `8.18.0.0` | The published `@browserstack/a11y-engine-core` version |
| 3 | **Frontend repo path** | `/Users/you/repos/frontend` | Absolute path |
| 4 | **bstackautomation-helper repo path** | `/Users/you/repos/bstackautomation-helper` | Absolute path |

---

## Step 1 — Patch frontend `package.json` (engine version)

```bash
cd <FRONTEND_REPO>
git checkout master && git pull origin master
git checkout -b dev-wa-crx-<ENV>-<VERSION>
```

Edit `apps/accessibility-toolkit/package.json` — set `"@browserstack/a11y-engine-core"` to `<ENGINE_VERSION>`.

> **Do NOT touch** `@browserstack/a11y-engine-core-at` — it is a separate package alias.

## Step 2 — Patch `environmentConstants.js` (backend URLs)

Edit `apps/accessibility-toolkit/env/environmentConstants.js` — update the backend URL block for the target environment.

| Environment | `a11yEngineHost` value |
|---|---|
| `regression` | `'a11y-engine-regression.bsstag.com'` |
| `preprod` | `'a11y-engine-preprod.bsstag.com'` |
| `prod` | `'accessibility.browserstack.com'` |
| `local` | Your ngrok host (see `stack:local-extension-builder` Step 1) |

Find the matching `createEnvConfig` block for your target env and verify/update the `a11yEngineHost` value. For regression builds using the `REGRESSION` block, confirm the host points to regression infra.

## Step 3 — Install and build

```bash
cd <FRONTEND_REPO>
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use
corepack pnpm install --filter accessibility-toolkit...
cd apps/accessibility-toolkit
corepack pnpm run build-package:<ENV>
```

Build target mapping:

| Environment | Build target |
|---|---|
| `regression` | `regression` |
| `preprod` | `preprod` |
| `prod` | `prod` |
| `local` | `local` |
| `staging` | `stag` |

Verify the build output:

```bash
ls -la dist/
node -e 'const m=require("./dist/manifest.json");console.log("v"+m.version)'
```

## Step 4 — Pack CRX

Chrome's `--pack-extension` creates a `.crx` from the unpacked `dist/` directory.

**macOS:**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --pack-extension="$(pwd)/dist" \
  --no-message-box
```

**Linux:**

```bash
google-chrome --pack-extension="$(pwd)/dist" --no-message-box
```

This produces `dist.crx` and `dist.pem` in the parent directory. The `.pem` is the signing key — keep it if you need to update the CRX later (same extension ID).

## Step 5 — Rename CRX

Follow the naming convention: `<env>-<version>.crx`

```bash
MANIFEST_VERSION=$(node -e 'console.log(require("./dist/manifest.json").version)')
mv ../dist.crx "<ENV>-${MANIFEST_VERSION}.crx"
```

Examples: `regression-8.18.0.0.crx`, `preprod-8.18.0.0.crx`

## Step 6 — PR to bstackautomation-helper

Copy the CRX to the correct directories in `bstackautomation-helper`:

```bash
cd <BSTACKAUTOMATION_HELPER_REPO>
git checkout master && git pull origin master
git checkout -b chore/wa-crx-<ENV>-<VERSION>

# Primary directory
cp <CRX_PATH> constants/web_a11y/extensions/<ENV>/

# For regression: also copy to rengg directory
# (regression only — skip for preprod/prod)
cp <CRX_PATH> constants/web_a11y/extensions/rengg-regression-web-a11y/
```

### Directory mapping

| Environment | Primary directory | Secondary directory |
|---|---|---|
| `regression` | `constants/web_a11y/extensions/regression/` | `constants/web_a11y/extensions/rengg-regression-web-a11y/` |
| `preprod` | `constants/web_a11y/extensions/preprod/` | — |
| `prod` | `constants/web_a11y/extensions/prod/` | — |
| `local` | `constants/web_a11y/extensions/local/` | — |

Commit and push:

```bash
git add constants/web_a11y/extensions/
git commit -m "chore: add WA CRX <ENV>-<VERSION>"
git push origin chore/wa-crx-<ENV>-<VERSION>
gh pr create --title "chore: WA CRX <ENV>-<VERSION>" \
  --body "Add WA extension CRX for <ENV>, engine version <VERSION>"
```

## Step 7 — Restore frontend repo

```bash
cd <FRONTEND_REPO>
git checkout -- apps/accessibility-toolkit/package.json
git checkout -- apps/accessibility-toolkit/env/environmentConstants.js
git checkout master
```

**Critical:** Never leave patched `environmentConstants.js` or `package.json` on a pushed branch unless intentional (e.g., a publish-workflow branch).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pnpm run build-package:<env>` not found | Run `corepack pnpm run` to list available scripts. Check target mapping table above. |
| CRX packing produces no output | Verify Chrome path. On macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version` |
| Extension version mismatch | The version in `manifest.json` comes from `package.json` `version` field, not the engine version. Confirm manifest after build. |
| `dist.pem` already exists | Chrome won't overwrite. Remove the old `.pem` or use `--pack-extension-key=<path>` to reuse it. |
| Engine version not found on npm | Publish workflow Step 1 must complete first. Verify: `npm view @browserstack/a11y-engine-core@<VERSION>` |
| Wrong backend URL in built extension | Check `environmentConstants.js` patch in Step 2. Rebuild after fixing. |

## Related skills

- `stack:publish-workflow` — the upstream workflow that publishes the engine and rules before CRX creation.
- `stack:local-extension-builder` — build an unpacked extension for local testing (not CRX).
- `stack:local-at-automation-runner` — run automation against the built extension.
