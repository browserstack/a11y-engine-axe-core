---
name: stack:multi-env-compare
description: Run the Jenkins multi-environment comparison job (`a11yEngineMultiEnvCompareUtility`) to diff scan results across profiles (prod vs regression, regression vs preprod, etc.). Covers job params, URL sources, custom URL lists, and downstream `SdkNodeTest` interaction.
argument-hint: "<base-profile> <compare-profile> [a11y-engine-branch]"
---

# D2 — Multi-env Compare Job

Trigger and interpret the `a11yEngineMultiEnvCompareUtility` Jenkins job on minion-qa. Compares scan results across two environment profiles (e.g., prod vs regression) to detect regressions, false positives, or rule behavior differences before promoting a build.

## Trigger conditions

- "run multi-env compare", "compare regression vs prod", "environment comparison job"
- When validating a candidate deployment against a baseline environment
- Before promoting from regression → preprod or preprod → prod

## Pre-requisites

1. **Jenkins access** to minion-qa (`https://minion-qa.browserstack.com/`).
2. **Both environments deployed** with the versions you want to compare.
3. **a11y-engine branch** with the URL dataset (default: `main`).

---

## Step 1 — Open the Jenkins job

Navigate to:

```
https://minion-qa.browserstack.com/job/a11yEngineMultiEnvCompareUtility/build?delay=0sec
```

## Step 2 — Fill parameters

| Parameter | Description | Example | Notes |
|---|---|---|---|
| `BASE_PROFILE` | The baseline environment profile | `prod`, `reg` | This is the "known good" reference |
| `COMPARE_PROFILE` | The candidate environment profile | `reg`, `preprod` | This is what you're validating |
| `A11Y_ENGINE_BRANCH` | Branch of `a11y-engine` repo to read URL dataset from | `main`, `AXE-1234-feature` | Controls which URLs are scanned |
| `BASE_EXTENSION_VERSION` | Extension version for baseline | `latest` or specific version | From `#accessibility-qa-staging-deploys` |
| `COMPARE_EXTENSION_VERSION` | Extension version for candidate | `latest` or specific version | From `#accessibility-qa-staging-deploys` |
| `OS` | Operating system | `OS X` | Default — leave as-is |
| `AI_ENABLED` | Enable AI-lane scanning | `true` / `false` | Enable for AI-rule comparison |
| `AI_MODEL` | AI model to use if AI enabled | leave default | Only change if testing specific AI model |

### Common profile combinations

| Scenario | `BASE_PROFILE` | `COMPARE_PROFILE` |
|---|---|---|
| Validate regression against prod | `prod` | `reg` |
| Validate preprod against regression | `reg` | `preprod` |
| Validate preprod against prod | `prod` | `preprod` |
| Pre-release prod validation | `prod` | `preprod` |

## Step 3 — URL source

The job reads URLs from:

```
a11y-engine-core/test/dataset/defaultBstackUrls.csv
```

This file is checked out from the branch specified in `A11Y_ENGINE_BRANCH`.

### Using a custom URL list

To scan custom URLs instead of the default set:

1. **Push your URL list** to the a11y-engine repo on a feature branch:

```bash
cd <A11Y_ENGINE_REPO>
git checkout -b custom-urls-compare
# Edit or replace the CSV
cp my-urls.csv a11y-engine-core/test/dataset/defaultBstackUrls.csv
git add a11y-engine-core/test/dataset/defaultBstackUrls.csv
git commit -m "chore: custom URL list for multi-env compare"
git push origin custom-urls-compare
```

2. **Set `A11Y_ENGINE_BRANCH`** to your feature branch name in the Jenkins job.

The CSV format is simple — one URL per line (or comma-separated with a header row). Check the existing file for the exact format before replacing.

> **Warning:** The branch must exist on remote. The Jenkins job does a fresh checkout — local-only branches won't work.

## Step 4 — Downstream `SdkNodeTest` job

The compare utility triggers downstream `SdkNodeTest` builds — one per profile. These are the actual scan executions:

- `SdkNodeTest` with `PROFILE=<BASE_PROFILE>` → baseline results
- `SdkNodeTest` with `PROFILE=<COMPARE_PROFILE>` → candidate results

After both downstream jobs complete, the parent job diffs the results and produces a comparison report.

### Monitoring downstream jobs

1. Open the parent job's console output
2. Look for "Triggering SdkNodeTest" lines with build numbers
3. Click through to each downstream build to check progress

Downstream failures don't always fail the parent — check both.

## Step 5 — Interpret results

The job produces a comparison report showing:

| Metric | What it means |
|---|---|
| **Issues gained** | Candidate found issues baseline didn't — could be new TP or FP |
| **Issues lost** | Candidate missed issues baseline found — potential regression |
| **Issues matched** | Same issues in both — stable behavior |
| **Rule-level delta** | Per-rule issue count difference |

### Decision matrix

| Delta | Action |
|---|---|
| No delta | Safe to promote |
| Issues gained, all from new rules | Expected — verify rules are correct |
| Issues gained on existing rules | Investigate — likely FP increase |
| Issues lost on any rule | Investigate — likely regression (missed detections) |
| Large delta (>10% total issues) | Do NOT promote — deep investigation needed |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Job fails immediately | Check `A11Y_ENGINE_BRANCH` exists on remote. Verify Jenkins has git access. |
| One downstream `SdkNodeTest` fails | Check the downstream console log. Common: hub timeout (regression at night), credentials issue. |
| Empty comparison report | Both downstream jobs may have produced no results. Check if URLs are accessible from both environments. |
| `defaultBstackUrls.csv` not found | Branch may not have the file. Use `main` or verify your custom branch has it at the expected path. |
| Stale results | The job caches nothing — each run is a fresh scan. If results seem stale, check that the correct scanner/extension versions are deployed. |
| Profile `reg` vs `regression` confusion | Jenkins uses `reg` (short form), not `regression`. See also `stack:publish-workflow` Step 6 for profile naming. |

## Related skills

- `stack:automate-ab-test` — local A/B comparison (same concept, local execution).
- `stack:publish-workflow` — the workflow that deploys versions you then compare.
- `stack:local-automate-test` — run individual scans locally for debugging specific URLs.
