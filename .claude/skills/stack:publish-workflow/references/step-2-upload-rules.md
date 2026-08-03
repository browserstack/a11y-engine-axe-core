# Step 2 — Upload Rules to Environments

Reads params: `<A11Y_ENGINE_REPO>`, `<ACCESSIBILITY_REPO>`, `<ACCESSIBILITY_BRANCH>`, `<ENGINE_VERSION>`, target environments.

## 2.0 Record the current branch (for later restore)

```bash
cd <ACCESSIBILITY_REPO>
ORIGINAL_BRANCH=$(git branch --show-current)
```

## 2.1 Consolidate rules

```bash
cd <A11Y_ENGINE_REPO>/a11y-engine-core
node build/scripts/consolidate_rules.js
```

Verify output:

```bash
test -s consolidated_rules.json && echo "OK" || echo "FAIL: file missing or empty"
```

If missing or empty — stop and inform the user.

## 2.2 Prepare the accessibility repo

**New branch:**

```bash
cd <ACCESSIBILITY_REPO>
git checkout main && git pull origin main
git checkout -b <ACCESSIBILITY_BRANCH>
```

**Existing branch:**

```bash
cd <ACCESSIBILITY_REPO>
git checkout <ACCESSIBILITY_BRANCH>
git pull origin <ACCESSIBILITY_BRANCH>
```

## 2.3 Check for existing rules file

```bash
ls <ACCESSIBILITY_REPO>/db/rules/a11y_engine_<ENGINE_VERSION>.json 2>/dev/null
```

If it already exists — ask user whether to overwrite or skip.

## 2.4 Copy rules file

```bash
cp <A11Y_ENGINE_REPO>/a11y-engine-core/consolidated_rules.json \
   <ACCESSIBILITY_REPO>/db/rules/a11y_engine_<ENGINE_VERSION>.json
```

## 2.5 Commit and push

```bash
cd <ACCESSIBILITY_REPO>
git add db/rules/a11y_engine_<ENGINE_VERSION>.json
git commit --no-verify -m "chore: add rules for engine version <ENGINE_VERSION>"
git push origin <ACCESSIBILITY_BRANCH>
```

> **Why `--no-verify`:** Accessibility repo has a Ruby-based pre-commit hook that fails if `bundle install` hasn't been run. Safe to skip for JSON-only commits.
>
> **Safety:** Never push to `main` or `master`.

## 2.6 Verify branch exists on remote

```bash
git ls-remote --heads origin <ACCESSIBILITY_BRANCH>
```

If no output — stop and debug the push.

## 2.7 Trigger Jenkins rule upload (once per environment)

1. Open: <https://minion.browserstack.com/job/QA/job/AccessibilityTeam/job/A11yUploadRules/>
2. Click **Build with Parameters**.
3. Fill in:

| Field                  | Value                                            |
| ---------------------- | ------------------------------------------------ |
| `ENVIRONMENT`          | `preprod` / `regression` / other (one per build) |
| `RULES_FILE`           | `a11y_engine_<ENGINE_VERSION>.json`              |
| `ACCESSIBILITY_BRANCH` | `<ACCESSIBILITY_BRANCH>`                         |
| `ENGINE_VERSION`       | `<ENGINE_VERSION>`                               |
| `IS_AT`                | **unchecked**                                    |

> **Important:** `RULES_FILE` is the **filename only** — do **not** include the `db/rules/` path prefix.

4. Click **Build**. Note the build number and share the link.
5. Repeat for each environment. Order does not matter.

## 2.8 Restore original branch

```bash
cd <ACCESSIBILITY_REPO>
git checkout <ORIGINAL_BRANCH>
```

## Re-run for additional environments

If rules are already committed and pushed from a previous run with the same engine version, skip 2.1–2.6 and go directly to **2.7**.
