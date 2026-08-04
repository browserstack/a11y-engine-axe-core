---
name: stack:run-checks
description: Run linting, tests, and quality checks for one or all packages.
argument-hint: "[package]  e.g. 'all', 'a11y-engine-core', 'ip-protection', 'dom-forge-core'"
---

# Run Checks

## All Packages (root)

```bash
npm run lint:check        # ESLint (airbnb-base + prettier + sonarjs)
npm run lint:modified     # Only modified files (faster)
```

## a11y-engine-core

```bash
cd a11y-engine-core
npm run lint 2>&1 | head -50
npm test 2>&1 | tail -20
```

## ip-protection

```bash
cd ip-protection
set -o pipefail
npx eslint . --max-warnings 0 2>&1 | head -50
npm test 2>&1 | tail -20
```

## dom-forge-core

```bash
cd dom-forge-core
npm run lint:check 2>&1 | head -50
npm test 2>&1 | tail -20
```

## Steps

1. Identify target package(s) from user request (default: all).
2. Run lint checks first (fast feedback).
3. Run tests.
4. Report: pass/fail counts, failing test names, lint errors with file:line.
