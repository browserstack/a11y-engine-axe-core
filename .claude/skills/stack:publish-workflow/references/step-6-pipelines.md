# Step 6 — Run P0 and P1 Pipelines

Reads params: `<SCANNER_VERSION>` (from Slack — see Gate Check 2 in SKILL.md), target environments, selected pipelines.

## 6.1 Collect parameters

Ask the user which pipelines to run (multi-select):
- `p0`
- `p1`
- `wa_p0`
- `wa_p1`
- `prod_sanity_p0`
- `ai_p0`

## 6.2 Trigger Jenkins pipeline (once per pipeline per environment)

For **each** selected pipeline and **each** environment, trigger a separate build:

1. Open: <https://minion.browserstack.com/job/A11yEngine/view/all/job/A11yEngineWebsiteStagingRunner/build?delay=0sec>
2. Fill in the form:

| Field | Value | Notes |
|-------|-------|-------|
| `AUTOMATION_BRANCH` | `master` | Default — leave as-is |
| `AUTOMATION_HELPER_BRANCH` | `master` | Default — leave as-is |
| `PROFILE` | `preprod` / `reg` / etc. | Default is `reg`. Use `reg` for regression (not `regression`). Change to `preprod` for preprod. |
| `OS` | `OS X` | Default — leave as-is |
| `EXECUTION` | One of: `p0`, `p1`, `wa_p0`, `wa_p1`, `prod_sanity_p0`, `ai_p0` | Dropdown, single-select — one per build |
| `SCANNER_VERSION` | e.g., `4.47.0.0-preprod-1776940760` | Default is `latest` — **must change** to scanner version from Slack |
| `WA_SCANNER_VERSION` | `latest` | Default — leave as-is |
| `BROWSER` | `mac_chrome` | Default — leave as-is |
| `BROWSER_VERSION` | `latest` | Default — leave as-is |
| `CS_SCAN` | unchecked | |
| `IS_BACKWARD_COMPATIBLE` | unchecked | |
| `BACKWARD_COMPATIBLE_PACKAGE_VERSION` | leave empty | |
| `notifyA11y` | **unchecked** | Do NOT check — notifies the entire A11y QA team |
| `notifyOnFailure` | unchecked | |
| `notifyme` | **checked** | Notifies you when the build completes |

> **Warning:** The form resets all fields between builds. You must re-enter `PROFILE`, `EXECUTION`, `SCANNER_VERSION`, and re-check `notifyme` for each build.

3. Click **Build**. Note the build number and share the link.
4. Repeat for each pipeline × environment combination.

> **Example:** If user selects `p0`, `p1`, and `ai_p0` for `preprod`, trigger **3 separate builds** — each with the same `PROFILE` and `SCANNER_VERSION`, but different `EXECUTION` values.

## WA pipeline specifics

### `WA_SCANNER_VERSION` + `AUTOMATION_HELPER_BRANCH` coupling

When running `wa_p0` or `wa_p1`, the `WA_SCANNER_VERSION` and `AUTOMATION_HELPER_BRANCH` fields become load-bearing:

| Field | Default | When to change |
|---|---|---|
| `WA_SCANNER_VERSION` | `latest` | Set to a specific WA extension version when testing a particular CRX build. The version comes from the `BuildProductTools` output or `#accessibility-qa-staging-deploys`. |
| `AUTOMATION_HELPER_BRANCH` | `master` | Set to a feature branch of `bstackautomation-helper` when the WA CRX for the target env was PR'd to a branch (not yet merged to master). |

These two fields must be consistent — `WA_SCANNER_VERSION` must match a CRX that exists in the `bstackautomation-helper` branch specified by `AUTOMATION_HELPER_BRANCH`. Mismatches cause the WA test suite to load the wrong (or missing) extension.

## PROFILE → SDK branch mapping

The `PROFILE` field determines which SDK branch the pipeline's `setupOnDemandSDKRepo.sh` script checks out:

| PROFILE | SDK branch | API endpoint |
|---|---|---|
| `prod` | `main` | `accessibility.browserstack.com/api` |
| `reg` | `a11y-sdk-regression` | `a11y-engine-regression.bsstag.com/api` |
| `preprod` | `a11y-sdk-preprod` | `a11y-engine-preprod.bsstag.com/api` |

> **Note:** Use `reg` (short form) for regression, not `regression`. The Jenkins job and SDK infra use `reg` consistently.

### `setupOnDemandSDKRepo.sh` behavior

This script runs at the start of each pipeline build. It:

1. Clones or updates the `browserstack-node-agent` repo
2. Checks out the branch matching the `PROFILE` (see mapping table above)
3. Runs `npm install && npm run build`
4. Links the SDK for the test runner

The script expects the SDK branch to exist and have pre-patched API URLs for the target environment. If the branch is missing or broken, the pipeline fails at setup — not during scan execution.

### `a11y-sdk-regression` branch

The `a11y-sdk-regression` branch of `browserstack-node-agent` is a long-lived branch that tracks `main` but has regression-specific API URL patches applied. It must be kept in sync with `main` for SDK features/fixes. If regression pipeline tests fail on SDK-level issues that pass on prod, check if `a11y-sdk-regression` is behind `main`.
