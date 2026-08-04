---
name: stack:submit-pr
description: Create a pull request with pre-flight validation.
disable-model-invocation: true
argument-hint: '[base-branch]  default: main'
---

# Submit PR

## Step 1 — Pre-flight

```bash
BASE_BRANCH="${1:-main}"
git status
git diff --stat "${BASE_BRANCH}...HEAD"
git log --oneline "${BASE_BRANCH}...HEAD"
```

Validate:

- All changes committed
- Branch is up to date with base
- Diff size: <200 LOC preferred, 200-600 warn, >600 recommend split

## Step 2 — Self-Review

Run the `stack:code-review` skill checklist against the diff (lane-aware checks for the diff's sub-projects).

## Step 3 — Lint & Test

Run affected package tests:

```bash
npm run lint:check
# + package-specific tests
```

## Step 4 — Create PR

```bash
gh pr create --title "<type>(<scope>): <subject>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Changes
<affected packages and what changed>

## Testing
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] Manual verification (if applicable)

## Checklist
- [ ] No inline constants
- [ ] No console.log in browser context
- [ ] Auth on new routes (ip-protection)
- [ ] TTLs on Redis/S3 data (ip-protection)
- [ ] axe-core changes tagged (if applicable)
EOF
)"
```

## Step 5 — Report

Return PR URL and summary of changes.
