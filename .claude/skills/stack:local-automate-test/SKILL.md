---
name: stack:local-automate-test
description: Run BrowserStack Automate accessibility scans locally using the Node SDK. Covers SDK setup (npm link), env-specific patching, browserstack.yml config, running scans, and CSV report fetching. Triggers&colon; "run automate test locally", "local SDK scan", "automate a11y test".
argument-hint: "<regression|preprod|prod> [--single-url|--batch] [url...]"
---

# C1 — Running Automate Tests Locally

Run BrowserStack Automate accessibility scans from your local machine using the `browserstack-node-agent` SDK. Covers SDK linking, environment config, scan execution, and report retrieval.

## Trigger conditions

- "run automate test locally", "local SDK scan", "test a11y with automate", "run accessibility scan"
- When validating engine/rule changes against real BrowserStack Automate infrastructure

## Pre-requisites

1. **BrowserStack account** with Automate access for the target environment.
2. **`browserstack-node-agent` repo cloned** — the Node SDK.
3. **Node.js 18+** installed via nvm.
4. **BrowserStack credentials** as environment variables (see Step 1).

---

## Step 0 — SDK branch selection

The SDK repo branch must match the target environment:

| Environment | SDK branch | Notes |
|---|---|---|
| **prod** | `main` | No API URL patching needed |
| **regression** | `a11y-sdk-regression` | Pre-patched for regression endpoints |
| **preprod** | `a11y-sdk-preprod` | Pre-patched for preprod endpoints |

```bash
cd <SDK_REPO>
git checkout <BRANCH>
git pull origin <BRANCH>
npm install
npm run build   # if build step exists
```

## Step 1 — Set credentials as environment variables

**CRITICAL: Credentials must be env vars, NEVER hardcoded in `browserstack.yml` or source files.**

```bash
export BROWSERSTACK_USERNAME="<your-username>"
export BROWSERSTACK_ACCESS_KEY="<your-access-key>"
```

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, `~/.config/fish/config.fish`) for persistence.

For regression/preprod, use the environment-specific credentials (different from prod). Ask the team lead if you don't have them.

## Step 2 — Set `BROWSERSTACK_ENV`

```bash
export BROWSERSTACK_ENV="<environment>"
```

| Environment | Value |
|---|---|
| prod | `production` (or unset — default) |
| regression | `regression` |
| preprod | `preprod` |

## Step 3 — API URL patching (non-prod only)

For **prod**, skip this step — the SDK defaults to `accessibility.browserstack.com/api`.

For **regression** and **preprod**, the SDK's internal API endpoint must point to the environment-specific backend. If using the dedicated branch (`a11y-sdk-regression` / `a11y-sdk-preprod`), this is already patched. Otherwise, patch manually:

Find the API base URL in the SDK source (typically in a config or constants file):

```bash
grep -rn "accessibility.browserstack.com" <SDK_REPO>/src/ <SDK_REPO>/lib/
```

Replace `accessibility.browserstack.com/api` with:

| Environment | API URL |
|---|---|
| regression | `a11y-engine-regression.bsstag.com/api` |
| preprod | `a11y-engine-preprod.bsstag.com/api` |

> **Warning:** Never commit API URL patches to `main`. Use the dedicated env branches or revert before pushing.

## Step 4 — Link SDK locally

```bash
cd <SDK_REPO>
npm link

cd <YOUR_TEST_PROJECT>
npm link browserstack-node-agent
```

Verify the link:

```bash
ls -la node_modules/browserstack-node-agent
# Should show symlink → <SDK_REPO>
```

## Step 5 — Configure `browserstack.yml`

Create or edit `browserstack.yml` in your test project root:

```yaml
# browserstack.yml
userName: ${BROWSERSTACK_USERNAME}
accessKey: ${BROWSERSTACK_ACCESS_KEY}

platforms:
  - os: OS X
    osVersion: Sonoma
    browserName: Chrome
    browserVersion: latest

browserstackAutomation: true

accessibility: true
accessibilityOptions:
  wcagVersion: "wcag21"
  bestPractice: true
  needsReview: true

buildName: "local-a11y-scan-<date>"
projectName: "a11y-engine-validation"

debug: true
networkLogs: true
```

**CRITICAL:** The `userName` and `accessKey` fields MUST reference env vars (`${BROWSERSTACK_USERNAME}` / `${BROWSERSTACK_ACCESS_KEY}`). The SDK resolves these at runtime. **NEVER** put actual credentials in this file.

## Step 6 — Run scans

### Single URL

```bash
cd <YOUR_TEST_PROJECT>
npx browserstack-node-agent --config browserstack.yml --url "https://example.com"
```

### Batch (multiple URLs)

Create a URL list file (`urls.txt`):

```
https://example.com
https://example.com/about
https://example.com/contact
```

```bash
npx browserstack-node-agent --config browserstack.yml --url-file urls.txt
```

### Parallel execution

```bash
npx browserstack-node-agent --config browserstack.yml --url-file urls.txt --parallel 5
```

## Step 7 — Fetch reports (CSV via API)

Reports are fetched via a 3-step API flow: initiate → poll → download.

### 7.1 Initiate report generation

```bash
curl -u "${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}" \
  -X POST "https://<API_HOST>/api/reports/csv" \
  -H "Content-Type: application/json" \
  -d '{"buildId": "<BUILD_ID>"}'
```

Replace `<API_HOST>` per environment:

| Environment | API host |
|---|---|
| prod | `accessibility.browserstack.com` |
| regression | `a11y-engine-regression.bsstag.com` |
| preprod | `a11y-engine-preprod.bsstag.com` |

### 7.2 Poll for completion

```bash
curl -u "${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}" \
  "https://<API_HOST>/api/reports/csv/status?reportId=<REPORT_ID>"
```

Poll every 10 seconds. Status values: `pending`, `processing`, `completed`, `failed`.

### 7.3 Download CSV

```bash
curl -u "${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}" \
  -o report.csv \
  "https://<API_HOST>/api/reports/csv/download?reportId=<REPORT_ID>"
```

### Retry logic

Intermittent failures are common, especially on regression at night (infra scales down). Retry strategy:

```bash
MAX_RETRIES=3
RETRY_DELAY=30  # seconds

for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i of $MAX_RETRIES"
  npx browserstack-node-agent --config browserstack.yml --url "<URL>" && break
  echo "Failed, retrying in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done
```

---

## Environment-specific notes

### Regression

- **Hub intermittent at night** — regression Automate hub scales down during off-hours. Scans may fail with connection timeouts between ~11 PM and ~7 AM IST. Retry or run during business hours.
- Uses `a11y-sdk-regression` branch (pre-patched API URLs).
- Credentials differ from prod — use regression-specific username/key.

### Preprod

- Uses `a11y-sdk-preprod` branch (pre-patched API URLs).
- More stable than regression but still not prod-grade uptime.
- Credentials differ from prod.

### Prod

- Uses `main` branch — no API URL patching needed.
- Most stable. Use for final validation before release sign-off.
- Standard BrowserStack prod credentials.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `BROWSERSTACK_USERNAME is not defined` | Set env vars per Step 1. Do NOT hardcode in yml. |
| `accessibility.browserstack.com` connection refused (non-prod) | API URL not patched. Check Step 3 or use the dedicated env branch. |
| Scan hangs indefinitely | Check `BROWSERSTACK_ENV` is set correctly (Step 2). Wrong env = wrong hub. |
| `npm link` not taking effect | Verify symlink: `ls -la node_modules/browserstack-node-agent`. May need `npm link` again after `npm install`. |
| CSV report stuck on `pending` | Backend processing lag. Wait 60s and re-poll. If still stuck after 5 min, the scan may have failed — check the build on the dashboard. |
| Regression hub timeout at night | Expected. Retry during business hours (IST). |
| `ECONNREFUSED` on regression | Regression infra may be down. Check `#team-a11y-engine-zenduty-notifications` for active alerts. |

## Related skills

- `stack:publish-workflow` — publishes engine + rules before you can validate with Automate.
- `stack:automate-ab-test` — A/B comparison of baseline vs candidate using this same SDK flow.
- `stack:create-wa-crx` — builds the WA CRX that Automate uses for scans.
