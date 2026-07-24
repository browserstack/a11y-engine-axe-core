# Testing

Three test stacks across the monorepo, one per package. No cross-package integration test runner.

## Frameworks

| Package | Framework | Runner | Test root |
|---|---|---|---|
| `a11y-engine-core` | Mocha + Chai inside Karma | `npm test` (cd into the package) | `a11y-engine-core/test/` |
| `dom-forge-core` | Mocha | `npm test` | `dom-forge-core/test/checks/`, `dom-forge-core/test/*Spec.js` |
| `ip-protection` | Jest | `npm test` | `ip-protection/test/**/*.test.js` |

## What tests must cover (project convention)

Every test suite must include:

1. **Happy path** — the canonical success scenario.
2. **Empty / null state** — missing DOM, empty payload, no scan context, no AI state key.
3. **Error / recovery path** — at least one failure mode and how it surfaces.

## Manual test matrix (before requesting QA or merging)

The unit suite is necessary but not sufficient. The repeating prod-bug categories ("worked in tests, broke in prod") come from environments the unit suite doesn't cover. Run through this matrix for the affected lanes before declaring a PR ready:

| Dimension | What to cover | Required for |
|---|---|---|
| **Site coverage** | P0 sites + at least one site in the affected domain (e.g., e-commerce, banking) | All rule/AT changes |
| **Shadow DOM** | At least one shadow-DOM-heavy site (Material-UI, Salesforce Lightning, web components) | Any DOM traversal, `querySelector*`, or B1 async handler change |
| **Cross-origin iframes** | A page with cross-origin iframes; verify cross-origin limits surface as expected | DOM traversal changes |
| **Mutation ON / OFF** | Full-page mode and mutation scan mode (Workflow Analyser) | Any scan logic, dispatch, or rule list change |
| **Perception management ON / OFF** | Both states must produce the documented output | Any rule output, tagging, or message change |
| **Feature flag ON / OFF** | Both code paths exercised, including the OFF default for new flags | Any flag-gated change |
| **AT sanity** | Auto-Test flow end-to-end (Forms AT, Responsiveness AT, etc.) | Any change touching `lib/at-*`, base AT class, or AT-affected utilities |
| **Redis stress on staging** | Realistic concurrency (≥100 scans/min) with the new code paths active | Any Redis read/write fan-out increase or new key family |

List the test cases you actually executed in the PR description (date, site, mode, flag state, result). Reviewers ask for this — "dev tested" without specifics is a red flag.

## Shared / common helper changes

When the diff touches `utils/`, `commons/helper.js`, `lib/commons/`, `controllers/apiClient.js`, or any module imported by ≥2 rules / ATs:

- List every consumer in the PR description.
- Add a unit test for each consumer's call shape (not the helper alone).
- Run the manual matrix above against rules/ATs in each affected consumer's domain — a "null check fix" to a shared helper has shipped breakage to ResponsivenessAT (Jan 2026 incident).

## Test fixtures

### `a11y-engine-core`

- **Rule + check fixtures** under `lib/checks/<category>/` and `lib/rules/<category>/`. The corresponding tests live in `test/` mirroring the structure.
- For Type B1 rules, the test must verify the rule classification array entries in `lib/core/base/constants.js` are consistent.

### `ip-protection`

- **Controller tests** mock auth middleware and Redis. Use the existing patterns in `test/controllers/`.
- **Worker tests** mock BullMQ and Redis. The job dispatch function is the unit under test, not the queue itself.
- **AI tests** stub the outbound AI API (`apiClient.js:getAIResponse`) and the webhook handlers separately — they form distinct test surfaces.

### `dom-forge-core`

- Mocha specs in `test/checks/` exercise individual Type C runners (`color-contrast.js`, `focus-visible.js`, `non-text-control-contrast.js`, etc.).
- `test/*Spec.js` covers cross-runner concerns.

## Local debugging without Percy

Use `mini-percy-renderer/scripts/run-with-axe.js` (Darwin-arm64 only) to replay a saved Percy `proxy_map.json` against axe locally:

```bash
node mini-percy-renderer/scripts/run-with-axe.js /tmp/debug-fp-<rule-id>.js [--match=<url-substring>]
```

This is the canonical workflow for debugging false positives without a live URL — see `skills/stack:debugging.md`.

## Pre-commit gate

Husky pre-commit hook runs lint-staged (`.lintstagedrc.js`):
- Prettier on staged files.
- ESLint `--fix` on staged files.

Tests are **not** run on pre-commit — they run in CI. Don't rely on the hook to catch test regressions.

## CI

CI configuration lives in `.github/workflows/`. Tests run per-package on PRs; lint runs across the repo.

## Adding a new test category

- Match the package's existing framework — don't introduce Jest into `a11y-engine-core` or Karma into `ip-protection`.
- Follow the **happy / empty / error** triad.
- For Redis-touching tests in `ip-protection`, use a TTL'd mock or `ioredis-mock`. Never hit a real Redis from a test.
- For socket-touching tests, mock the `io` instance — never bind a real port.

## Test runners and node version

All three packages require **Node 18.20.4** (`nvm use 18.20.4`). The runners assume this — running on a newer Node may break native module compilation (e.g., `redis-stack` bindings for `ip-protection`).
