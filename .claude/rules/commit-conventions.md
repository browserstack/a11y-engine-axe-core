---
paths:
  - "**"
---

# Commit Conventions

## Format

The repo does not strictly enforce Conventional Commits, but the prevailing style mirrors them. For new work, prefer:

```
<type>(<scope>): <subject>

<optional body explaining what and why>

<optional footer with Jira link>
```

- `<type>` ∈ `feat | fix | docs | style | refactor | test | chore | perf`
- `<scope>` is the package or rule name — e.g., `ip-protection`, `a11y-engine-core`, `dom-forge-core`, `axe-core`, `rule:color-contrast`, `worker:b1`, `scripts`.
- `<subject>` ≤ 50 chars, imperative mood, no period.
- Wrap body at 72 chars.

## Inside `axe-core/` (submodule) — tag every change

Every modification in the `axe-core/` submodule **must** carry a comment that tags impact scope. This is how reviewers assess blast radius without re-reading the whole submodule.

```js
// [tag]: short description
```

| Tag | Scope |
|---|---|
| `a11y-critical` | Affects multiple modules (global blast radius) |
| `a11y-domforge` | dom-forge-core impact |
| `a11y-ip` | ip-protection impact |
| `a11y-core` | a11y-engine-core impact |
| `a11y-rule-<name>` | Rule-specific (e.g., `a11y-rule-color-contrast`) |

**Guidelines for tag descriptions**:
- Keep concise and clear.
- **Never include sensitive information** — this is a public repository.

## Lint and formatting (pre-commit gate)

- Husky pre-commit hook runs lint-staged (see `.lintstagedrc.js` and `.husky/`).
- lint-staged runs Prettier + ESLint `--fix` on modified files. Failures block the commit.
- `npm run lint:check` runs the full lint without auto-fix. `npm run lint:fix` runs with fix.
- `npm run lint:modified` runs fix only on tracked-modified files — useful for incremental cleanup of legacy code.

## Branching

- Default branch is `main`.
- The release script (`scripts/bumpA11yEngine.sh`) commits version bumps directly to `main` for `a11y-engine-core/package.json` — keep the tree clean before running it.
- Sibling-repo PRs (in `accessibility` and `frontend`) are opened by the release script via `gh pr create`.

## When NOT to skip the hook

Do not pass `--no-verify` to bypass the pre-commit hook unless:
1. It's a documentation-only commit AND the hook is wrongly tripping on unrelated files, OR
2. You're committing a hot fix and will follow up with a lint-clean commit immediately.

Every `--no-verify` should be flagged in the PR description.
