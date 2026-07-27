---
name: stack:automate-ab-validation
description: Run 4-scenario A/B comparison on BrowserStack Automate regression environment &mdash; two branches (e.g. main vs R2) × ancestry ON/OFF. Deploys backends, swaps extensions via TapScanner, toggles ancestry via Redis, runs SDK scans, fetches CSV reports, and diffs results. Requires VPN, npm-linked SDK, and `BROWSERSTACK_ENV=reg`.
argument-hint: "[BL|R2|full]   e.g. 'full' runs all 4 scans end-to-end"
---

# Automate A/B Validation — Regression Environment

Run a **4-scenario A/B comparison** on BrowserStack Automate's regression (`reg`) environment:

| Scan | Branch      | Ancestry | Config file           |
| ---- | ----------- | -------- | --------------------- |
| S1   | BL (main)   | ON       | `browserstack-bl.yml` |
| S2   | BL (main)   | OFF      | `browserstack-bl.yml` |
| S3   | R2 (branch) | ON       | `browserstack-r2.yml` |
| S4   | R2 (branch) | OFF      | `browserstack-r2.yml` |

Then fetch CSV reports and diff selectors, rule counts, and escape-char handling.

## Step 0 — Discovery & state

On first use, DISCOVER paths and creds and persist to `state.local.json` in this skill's
directory (create it; never commit; `chmod 600`). On later runs, read it first and only
re-verify cheaply.

```jsonc
{
  "scripts_dir": "<abs path>",
  "sdk_repo": "<abs path to browserstack-node-agent>",
  "a11y_engine_repo": "<abs path to a11y-engine>",
  "creds": {
    "aut_username": "<FILL>",
    "aut_access_key": "<FILL>",
    "group_id": "<FILL>",
    "user_id": "<FILL>"
  },
  "jenkins": {
    "minion_user": "<FILL>",
    "minion_token": "<FILL>",
    "qa_minion_user": "<FILL>",
    "qa_minion_token": "<FILL>"
  },
  "tapscanner": {
    "bl_id": 315,
    "r2_id": 309
  },
  "image_tags": {
    "bl": "regression-847dc756-260727102649Z",
    "r2": "reg-e2aa7ae3-260727111510Z"
  },
  "build_ids": {
    "s1_th": null,
    "s2_th": null,
    "s3_th": null,
    "s4_th": null
  },
  "tunnel_url": null
}
```

> Strip `//` comments when writing — `jq` needs strict JSON.

**Discover paths:**

```bash
# Scripts dir
ls ~/accessibility/spectra-ai/tmp/AXE-3774/tools/reg-test/scripts/scan-comprehensive.js 2>/dev/null \
  || find ~/accessibility -name "scan-comprehensive.js" -maxdepth 6 2>/dev/null

# SDK repo (must be on a11y-sdk-regression branch)
ls ~/accessibility/browserstack-node-agent/src/bin/utils/constants.js 2>/dev/null \
  || find ~/accessibility -name "browserstack-node-agent" -type d -maxdepth 3 2>/dev/null
git -C <sdk_repo> branch --show-current  # must be: a11y-sdk-regression

# a11y-engine repo
ls ~/accessibility/spectra-ai/tmp/AXE-3774/a11y-engine 2>/dev/null
```

**Creds:** the AGENT must NOT write real credentials. Write `state.local.json` with `<FILL>`
placeholders — point user to the file to replace them. Read creds via `jq` at runtime so
literals never land in tool-call args.

**Current env state — check what's deployed before touching anything:**

```bash
# Backend version (axe-core dep reveals BL vs R2)
POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "a11y-engine-service" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $POD -- sh -c \
  'cat /home/app/ip-protection/package.json' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('axe-core:', d['dependencies']['axe-core'])"
# 4.11.0 = BL (main),  4.11.4 = R2

# Current TapScanner (extension)
A_POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "^accessibility-" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner '
ts = TapScanner.where(latest: true).last
puts "Latest: id=#{ts.id}, engine=#{ts.engine_version}"
'

# Ancestry flag
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'puts RedisUtils.is_feature_released_for_group?("target_format_ancestry", <group_id>)'
```

## Step 1 — Setup

### 1.1 SDK via `npm link` (REQUIRED — not symlink, not `npm install` from GitHub)

**Why `npm link`:** the published npm package is obfuscated with no `reg` env block. A GitHub
install has source but MISSING `generated/` protobuf files. Only `npm link` from the local
repo has BOTH the `reg` env block AND `generated/` files.

```bash
# In SDK repo — install deps + create global link
cd <sdk_repo>
git checkout a11y-sdk-regression
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm install --legacy-peer-deps
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm link

# In scripts dir — install + link SDK
cd <scripts_dir>
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm install --legacy-peer-deps
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm link browserstack-node-sdk --force
```

### 1.2 Verify SDK link

```bash
# Symlink target
readlink <scripts_dir>/node_modules/browserstack-node-sdk
# → should be relative path back to browserstack-node-agent

# Generated protobufs exist
ls <scripts_dir>/node_modules/browserstack-node-sdk/generated/
# → sdk_grpc_pb.js, sdk_pb.js, sdk-messages_grpc_pb.js, sdk-messages_pb.js

# Accessibility API patched to reg URL
head -1 <scripts_dir>/node_modules/browserstack-node-sdk/src/helpers/accessibility-automation/constants.js
# → exports.API_URL = 'https://accessibility-k8s.bsstag.com/api';
# If NOT patched:
# sed -i '' 's|accessibility.browserstack.com/api|accessibility-k8s.bsstag.com/api|' \
#   <scripts_dir>/node_modules/browserstack-node-sdk/src/helpers/accessibility-automation/constants.js
```

### 1.3 Verify `BROWSERSTACK_ENV=reg` activates regression URLs

```bash
BROWSERSTACK_ENV=reg /Users/sunny/.nvm/versions/node/v20.4.0/bin/node -e "
const c = require('<scripts_dir>/node_modules/browserstack-node-sdk/src/bin/utils/constants.js');
console.log('hubUrl:', c.hubUrl);
console.log('API:', c.BROWSERSTACK_API_URL);
"
# MUST show:
#   hubUrl: https://hub-k8s.bsstag.com/wd/hub
#   API: https://api-k8s.bsstag.com
```

### 1.4 Cloudflare tunnel

Test pages served via quick tunnel. Must be running.

```bash
# Check
curl -s -o /dev/null -w "%{http_code}" "https://<TUNNEL_URL>/comprehensive-escape.html"

# If down:
cd <scripts_dir>/../pages
python3 -m http.server 8080 &
cloudflared tunnel --url http://localhost:8080 --no-autoupdate 2>/tmp/cloudflared-tunnel.log &
sleep 8
grep "trycloudflare.com" /tmp/cloudflared-tunnel.log
# Update scan-comprehensive.js with new URL if changed
```

### 1.5 Config files

Both `browserstack-bl.yml` and `browserstack-r2.yml` MUST share the **same `buildName`** for
dashboard comparison:

```yaml
buildName: 'R2-comprehensive-escape-v3' # MUST MATCH across all 4 scans
```

---

## Step 2 — Baseline (BL) Scans

### 2.0 Deploy BL backend (if not already deployed)

```bash
kubectl --context stag set image deployment/a11y-engine-service -n regression \
  app=737963123736.dkr.ecr.eu-central-1.amazonaws.com/browserstack/a11y-engine:<bl_image_tag>
sleep 30
# Verify
POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "a11y-engine-service" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $POD -- sh -c \
  'cat /home/app/ip-protection/package.json' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('axe-core:', d['dependencies']['axe-core'])"
# MUST show: 4.11.0
```

**CRITICAL: NEVER touch `a11y-engine-jobs-sidekiq`.** It uses `browserstack/accessibility`
image, not `a11y-engine`. Setting the wrong image crashes sidekiq and takes down the API.

### 2.1 Set BL extension as latest

```bash
A_POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "^accessibility-" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner '
TapScanner.find(<r2_id>).update!(latest: false)
TapScanner.find(<bl_id>).update!(latest: true)
ts = TapScanner.where(latest: true).last
puts "Latest: id=#{ts.id}, engine=#{ts.engine_version}"
'
```

### 2.2 S1 — BL + Ancestry ON

Enable ancestry:

```bash
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'RedisUtils.add_to_release_whitelist("target_format_ancestry", <group_id>)'
# Verify: true
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'puts RedisUtils.is_feature_released_for_group?("target_format_ancestry", <group_id>)'
```

Run scan:

```bash
cd <scripts_dir>
BROWSERSTACK_ENV=reg \
BROWSERSTACK_USERNAME="$(jq -r .creds.aut_username <skill_dir>/state.local.json)" \
BROWSERSTACK_ACCESS_KEY="$(jq -r .creds.aut_access_key <skill_dir>/state.local.json)" \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npx browserstack-node-sdk mocha --timeout 120000 \
  scan-comprehensive.js --browserstack.config browserstack-bl.yml
```

Note `thBuildId` from output line: `Testhub started with id: <ID>`. Save to
`state.local.json` → `build_ids.s1_th`.

### 2.3 S2 — BL + Ancestry OFF

Disable ancestry:

```bash
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'RedisUtils.remove_from_release_whitelist("target_format_ancestry", <group_id>)'
```

Run same scan command as S1. Save thBuildId → `build_ids.s2_th`.

---

## Step 3 — Branch (R2) Scans

### 3.1 Deploy R2 backend

```bash
kubectl --context stag set image deployment/a11y-engine-service -n regression \
  app=737963123736.dkr.ecr.eu-central-1.amazonaws.com/browserstack/a11y-engine:<r2_image_tag>
sleep 30
# Verify
POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "a11y-engine-service" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $POD -- sh -c \
  'cat /home/app/ip-protection/package.json' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('axe-core:', d['dependencies']['axe-core'])"
# MUST show: 4.11.4
```

### 3.2 Set R2 extension as latest

```bash
A_POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "^accessibility-" | grep Running | head -1 | awk '{print $1}')
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner '
TapScanner.find(<bl_id>).update!(latest: false)
TapScanner.find(<r2_id>).update!(latest: true)
ts = TapScanner.where(latest: true).last
puts "Latest: id=#{ts.id}, engine=#{ts.engine_version}"
'
```

### 3.3 S3 — R2 + Ancestry ON

Enable ancestry (same command as S1), then run scan with R2 config:

```bash
cd <scripts_dir>
BROWSERSTACK_ENV=reg \
BROWSERSTACK_USERNAME="$(jq -r .creds.aut_username <skill_dir>/state.local.json)" \
BROWSERSTACK_ACCESS_KEY="$(jq -r .creds.aut_access_key <skill_dir>/state.local.json)" \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npx browserstack-node-sdk mocha --timeout 120000 \
  scan-comprehensive.js --browserstack.config browserstack-r2.yml
```

Save thBuildId → `build_ids.s3_th`.

### 3.4 S4 — R2 + Ancestry OFF

Disable ancestry, run same R2 scan command. Save thBuildId → `build_ids.s4_th`.

---

## Step 4 — Fetch Reports

### CSV download (3-step API flow per scan)

For each `thBuildId` (`s1_th` through `s4_th`):

```bash
# Read creds from state file
U="$(jq -r .creds.aut_username <skill_dir>/state.local.json)"
K="$(jq -r .creds.aut_access_key <skill_dir>/state.local.json)"

# 1. Initiate report generation
TASK_ID=$(curl -s -u "$U:$K" \
  "https://accessibility-k8s.bsstag.com/api/automated-tests/v1/builds/issues?build_id=<thBuildId>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['task_id'])")

# 2. Poll (wait 10s for generation)
sleep 10
LINK=$(curl -s -u "$U:$K" \
  "https://accessibility-k8s.bsstag.com/api/automated-tests/v1/builds/issues?task_id=$TASK_ID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['reportLink'])")

# 3. Download
curl -s "$LINK" -o S<N>-<LABEL>.csv
```

File naming convention:

- `S1-BL-ANCESTRY-ON.csv`
- `S2-BL-ANCESTRY-OFF.csv`
- `S3-R2-ANCESTRY-ON.csv`
- `S4-R2-ANCESTRY-OFF.csv`

### Dashboard URL

```
https://accessibility-k8s.bsstag.com/automated-tests/projects/p/builds/b/1?thBuildId=<thBuildId>
```

All 4 scans share `buildName` so they appear under one build in the dashboard.

---

## Step 5 — Compare

### Automated diff

```python
import csv
from collections import Counter

def load(path):
    with open(path) as f:
        return list(csv.DictReader(f))

s1, s2, s3, s4 = load('S1.csv'), load('S2.csv'), load('S3.csv'), load('S4.csv')

# Selector comparison (BL ancestry-ON vs R2 ancestry-ON)
s1_sels = sorted(set(r['CSS selector'] for r in s1))
s3_sels = sorted(set(r['CSS selector'] for r in s3))
only_s1 = set(s1_sels) - set(s3_sels)
only_s3 = set(s3_sels) - set(s1_sels)
print(f"S1 vs S3: {len(set(s1_sels) & set(s3_sels))} same, "
      f"{len(only_s1)} only-S1, {len(only_s3)} only-S3")

# Rule count comparison
s1_rules = Counter(r['Rule'] for r in s1)
s3_rules = Counter(r['Rule'] for r in s3)
for rule in sorted(set(list(s1_rules) + list(s3_rules))):
    c1, c3 = s1_rules.get(rule, 0), s3_rules.get(rule, 0)
    if c1 != c3:
        print(f"  {rule}: S1={c1} S3={c3} delta={c3 - c1}")

# Ancestry ON vs OFF (same branch)
s1_anc = set(r['CSS selector'] for r in s1)
s2_anc = set(r['CSS selector'] for r in s2)
print(f"\nBL ancestry ON vs OFF: {len(s1_anc & s2_anc)} same, "
      f"{len(s1_anc - s2_anc)} only-ON, {len(s2_anc - s1_anc)} only-OFF")

# Escape character check
import re
esc_pat = re.compile(r'[=":.]')
for label, rows in [('S1', s1), ('S3', s3)]:
    esc_count = sum(1 for r in rows if esc_pat.search(r.get('CSS selector', '')))
    print(f"{label} selectors with escape chars: {esc_count}/{len(rows)}")
```

### Summary template

```
## A/B Comparison: <BL branch> vs <R2 branch>
- S1 vs S3 (ancestry ON):  X same, Y only-BL, Z only-R2
- S2 vs S4 (ancestry OFF): X same, Y only-BL, Z only-R2
- BL ancestry ON vs OFF:   X same, Y only-ON, Z only-OFF
- R2 ancestry ON vs OFF:   X same, Y only-ON, Z only-OFF
- Rule count deltas: <list rules with changed counts>
- Escape char handling: <improved / same / regressed>
```

---

## Switching Between BL and R2 (manual)

### Deploy backend

```bash
# BL (main)
kubectl --context stag set image deployment/a11y-engine-service -n regression \
  app=737963123736.dkr.ecr.eu-central-1.amazonaws.com/browserstack/a11y-engine:<bl_image_tag>

# R2 (branch)
kubectl --context stag set image deployment/a11y-engine-service -n regression \
  app=737963123736.dkr.ecr.eu-central-1.amazonaws.com/browserstack/a11y-engine:<r2_image_tag>
```

### Or build via ContainerImageBuilder (~5 min)

```bash
curl -s -X POST -u "<minion_user>:<minion_token>" \
  "https://minion.browserstack.com/job/SelfServeInfrastructure/job/A11yEngineBase/job/ContainerImageBuilder/buildWithParameters" \
  --data-urlencode "GIT_BRANCH=main" \
  --data-urlencode "IMAGE_ENV=reg" \
  --data-urlencode "GIT_REPO=a11y-engine" --data-urlencode "IMAGE_NAME=a11y-engine" \
  --data-urlencode "DOCKERFILE_PATH=ip-protection/Dockerfile" --data-urlencode "ECR_REGION=eu-central-1"
```

Change `GIT_BRANCH=<branch>` for R2 (e.g. `AXE-3845-axe-core-upgrade-r2`).

### Swap TapScanner extension

```bash
A_POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "^accessibility-" | grep Running | head -1 | awk '{print $1}')
# Set BL as latest
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner '
TapScanner.find(<r2_id>).update!(latest: false); TapScanner.find(<bl_id>).update!(latest: true)'
# Set R2 as latest
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner '
TapScanner.find(<bl_id>).update!(latest: false); TapScanner.find(<r2_id>).update!(latest: true)'
```

### Building extensions from scratch (if TapScanner entries missing)

Jenkins pipelines on minion / qa-minion:

1. **NPM publish:** `A11yEngineStagingPackagePublish` on minion
2. **Extension build:** `BuildProductTools` on minion
3. **Rules upload:** `A11yUploadRules` on qa-minion (ENVIRONMENT=regression)
4. **Extension upload:** `A11yUploadExtension` on qa-minion

Reference: `a11y-engine/scripts/uploadStableExtensionStag.sh`

---

## Known Gotchas

| #   | Symptom                                                                         | Cause                                                                                           | Fix                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Access to BrowserStack denied due to incorrect credentials`                    | `BROWSERSTACK_ENV=reg` not set — SDK uses prod URLs, regression creds fail on prod              | Add `BROWSERSTACK_ENV=reg` to command. Verify with the constants.js check (Step 1.3)                                                                                                                        |
| 2   | `Cannot find module '../../../generated/sdk_grpc_pb'`                           | SDK installed from GitHub (no generated protobufs) or npm registry (obfuscated)                 | Use `npm link` from local repo (Step 1.1)                                                                                                                                                                   |
| 3   | `ENOTEMPTY` on `npm install`                                                    | Stale node_modules                                                                              | `rm -rf node_modules` then redo from Step 1.1                                                                                                                                                               |
| 4   | `npm: command not found` / pmg alias broken                                     | Shell alias conflict                                                                            | Use full path: `/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm` (and `/bin/npx`)                                                                                                                           |
| 5   | Sidekiq crash / API down after image change                                     | Changed `a11y-engine-jobs-sidekiq` image (uses `browserstack/accessibility`, not `a11y-engine`) | **NEVER change `a11y-engine-jobs-sidekiq` image.** If accidentally changed, restore: `kubectl --context stag set image deployment/a11y-engine-jobs-sidekiq -n regression app=<correct-accessibility-image>` |
| 6   | Ancestry flag not taking effect                                                 | Wrong group ID or flag key                                                                      | Verify group ID from state.local.json. Key: `target_format_ancestry`. Changes are immediate — no pod restart needed                                                                                         |
| 7   | Testhub CrashLoopBackOff                                                        | DB migration issue (ALGORITHM=INSTANT not supported for enum column change)                     | Check `#help-release-engineering` Slack. Independent of our testing                                                                                                                                         |
| 8   | Tunnel down after reboot                                                        | Cloudflare quick tunnel is ephemeral                                                            | Restart python server + cloudflared, get new URL, update scan-comprehensive.js                                                                                                                              |
| 9   | SDK shows `hubUrl: https://hub.browserstack.com` despite `BROWSERSTACK_ENV=reg` | Link points to obfuscated npm package, not source repo                                          | Redo `npm link` — verify with `readlink` and check `generated/` dir exists                                                                                                                                  |
| 10  | Report fetch returns empty / no `reportLink`                                    | Polled too early                                                                                | Retry step 2 of CSV download after 15-20s instead of 10s                                                                                                                                                    |

---

## Local Puppeteer Test (no infra needed)

For definitive BL vs R2 diff without AUT infrastructure:

```bash
cd <scripts_dir>
/Users/sunny/.nvm/versions/node/v20.4.0/bin/node comprehensive-local-test.mjs
```

Tests 8 combos: (BL-source, BL-min, R2-source, R2-min) x (CSS, ancestry).
Results: `tools/reg-test/results/comprehensive-local/`

## Test Page

Use `comprehensive-escape.html` — covers all escape scenarios:

- Parent with escape chars (`=`, `"`, `:`, `.`)
- Element itself malformed (self-violations)
- Nested malformed parents (2-3 levels deep)
- Deep nesting (15+ levels for >300 char path test)
- SVG elements
- Iframe in malformed parent
- ARIA violations in malformed context
- Clean controls (baseline)

## Quick Reference

See `references/quick-ref.md` for TapScanner IDs, image tags, Redis commands, and
credential table layout.

## Related skills

- `stack:build-and-run` — build the a11y-engine packages locally.
- `stack:local-extension-builder` — build the WA/AUT extension against a locally-built engine.
- `stack:publish-workflow` — end-to-end staging package publish, rules upload, extension build, deploy.
