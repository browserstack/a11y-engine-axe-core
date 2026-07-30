---
name: stack:automate-ab-test
description: Run A/B comparison scans — baseline (prod/latest) vs candidate (custom scanner version) on the same URL set. Uses `tools/ab-compare/ab-runner.js` for execution and report diffing. Triggers&colon; "A/B test", "compare scans", "baseline vs candidate".
argument-hint: "<baseline-version> <candidate-version> [url-list]"
---

# C2 — A/B Testing (Automate Scans)

Run baseline vs candidate accessibility scans on the same URL set and compare results. Used to validate that a new engine/scanner version does not regress issue counts, miss rules, or introduce false positives relative to the current production baseline.

## Trigger conditions

- "A/B test", "compare scans", "baseline vs candidate", "regression comparison"
- When validating a new engine version against prod before release
- When investigating whether a rule change introduces FP/FN delta

## Pre-requisites

1. **Both scanner versions available** — baseline (typically `latest` or current prod) and candidate (the version under test).
2. **BrowserStack credentials** as env vars (`BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`).
3. **`tools/ab-compare/` directory** present in the a11y-engine repo (or standalone checkout).
4. **Node.js 18+** via nvm.

---

## Step 1 — Prepare URL list

The A/B runner scans both versions against the same URL set. Prepare a URL list file:

```bash
# urls.txt — one URL per line
https://example.com
https://example.com/about
https://example.com/products
https://example.com/contact
```

**URL selection guidelines:**
- Include pages that exercise the changed rules
- Mix simple and complex pages (tables, forms, ARIA widgets)
- Include at least 1 page with Shadow DOM if the change touches DOM traversal
- 10–50 URLs is typical for a targeted comparison; 100+ for a broad release validation

## Step 2 — Configure the A/B runner

Edit or create `tools/ab-compare/config.json`:

```jsonc
{
  "baseline": {
    "scannerVersion": "latest",       // or specific version like "4.47.0.0-prod-1776940760"
    "profile": "prod",                // environment profile
    "label": "baseline-prod"          // label for report output
  },
  "candidate": {
    "scannerVersion": "4.48.0.0-preprod-1777000000",  // version under test
    "profile": "preprod",             // environment where candidate is deployed
    "label": "candidate-preprod"      // label for report output
  },
  "urls": "./urls.txt",              // path to URL list (or inline array)
  "parallel": 3,                     // concurrent scans per version
  "output": "./ab-results/"          // output directory for reports
}
```

### Version sources

| Use case | Baseline | Candidate |
|---|---|---|
| New engine release validation | `latest` (current prod scanner) | The new scanner version from `#accessibility-qa-staging-deploys` |
| Rule change validation | Current prod scanner | Scanner built with the rule change |
| Hotfix verification | Pre-hotfix scanner version | Post-hotfix scanner version |

## Step 3 — Run the A/B comparison

```bash
cd <A11Y_ENGINE_REPO>
export BROWSERSTACK_USERNAME="<username>"
export BROWSERSTACK_ACCESS_KEY="<access-key>"

node tools/ab-compare/ab-runner.js --config tools/ab-compare/config.json
```

The runner:
1. Scans all URLs with the **baseline** scanner version
2. Scans all URLs with the **candidate** scanner version
3. Generates a diff report comparing issue counts, rule hits, and severity

### Scan flow

```
URLs ──► Baseline scan (prod scanner)  ──► baseline-results.json
    └──► Candidate scan (new scanner)  ──► candidate-results.json
                                              │
                                    Diff engine compares
                                              │
                                         ab-report.json
```

## Step 4 — Analyze results

The output directory contains:

| File | Contents |
|---|---|
| `baseline-results.json` | Raw scan results from baseline |
| `candidate-results.json` | Raw scan results from candidate |
| `ab-report.json` | Diff summary: added/removed/changed issues per URL per rule |
| `ab-report.csv` | Tabular format for spreadsheet analysis |

### Key metrics to check

1. **Total issue count delta** — candidate should not have significantly more issues (FP increase) or fewer (missed detections)
2. **Per-rule delta** — identify which rules gained/lost hits
3. **New rules** — candidate may report issues for newly added rules (expected)
4. **Severity shifts** — same issue flagged at different severity = rule logic change

### Interpreting the diff

```
Rule: color-contrast
  Baseline: 42 issues across 15 URLs
  Candidate: 45 issues across 15 URLs
  Delta: +3 (new detections on URLs #7, #12, #14)
  Verdict: REVIEW — check if new detections are TP or FP
```

- **Delta = 0**: No change — good for rules that weren't modified.
- **Delta > 0 (candidate higher)**: New detections. Verify they're true positives.
- **Delta < 0 (candidate lower)**: Lost detections. Verify they're not regressions (missed real issues).

## Step 5 — URL list management

### Standard URL lists

| List | Location | Use case |
|---|---|---|
| Default BStack URLs | `a11y-engine-core/test/dataset/defaultBstackUrls.csv` | Standard regression set |
| Custom list | `tools/ab-compare/urls.txt` | Targeted validation |

### Adding URLs for specific rule testing

If testing a specific rule change, build a targeted URL list:

```bash
# Find pages known to trigger the rule
grep "<rule-id>" test/integration/full/*/test.json | \
  jq -r '.url' > tools/ab-compare/urls-<rule-id>.txt
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Scans fail on one version but not the other | Check that both scanner versions are deployed and accessible in their respective environments |
| Large delta on unmodified rules | Check if the URL content changed between scans (dynamic pages). Re-run both simultaneously. |
| `ab-runner.js` not found | Verify the tool exists: `ls tools/ab-compare/`. May need to be pulled from a specific branch. |
| Timeout on large URL sets | Reduce `parallel` count or split the URL list into batches |
| Credentials error | Verify `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` env vars are set for the correct environment |

## Related skills

- `stack:local-automate-test` — the underlying SDK scan flow that the A/B runner wraps.
- `stack:multi-env-compare` — Jenkins-based multi-env comparison (broader scope, automated).
- `stack:publish-workflow` — the publish flow that produces the candidate scanner version.
