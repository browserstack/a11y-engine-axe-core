---
paths:
  - "**"
---

# Security Rules

Applies to all packages.

## Secrets

- **No secrets in code.** Use environment variables and `ip-protection/config/keys.yml` (gitignored — copied from `keys.yml.sample` by `scripts/setup.sh`, populated from Vault).
- **Do not log raw tokens, auth headers, or PII** at any level. The current middleware logs `authHeader` at info — if you copy that pattern, redact in new routes.
- The `.npmrc-template` file is the only token-bearing config that ships — engineers copy it to `.npmrc` and inject their GitHub PAT locally. The template never carries a real token.
- **Never `JSON.stringify` an object that may contain secrets** in error messages, log lines, or anything that surfaces to `window.errors`/EDS. `apiData` and `config` objects routinely carry `aiAuthToken`, `authToken`, `apiKey`. Build error payloads field-by-field with an allowlist, never `JSON.stringify(apiData)` (PR #2102). When in doubt, log the keys you need, not the whole object.
- **Never store credentials on `globalThis`** (or `window`, or any module-level mutable). EDS config, AI tokens, API keys must not be reachable by other code in the same context (PR #1971).

## Frontend ↔ backend boundary (IP protection)

`a11y-engine-core`, `dom-forge-core`, the extension, and the Percy-side runtime all run in **browser context** — their code is shipped to user machines and is inspectable. `ip-protection` is the only trust boundary where proprietary logic stays private.

- **Core heuristics, evaluation, and scoring logic live in `ip-protection`.** Browser-context code only collects DOM/asset data and surfaces results. Repeatedly flagged in PR reviews (e.g., PR #2020) — shipping evaluation logic in `a11y-engine-core` or the extension exposes the algorithm. Acceptable exceptions: pure data capture (DOM serialization, computed-style snapshots), asset fetching, structural axe checks that ship as part of the public axe-core fork.
- **Never forward auth tokens to browser-side code.** `aiAuthToken`, `BASIC_*_AUTHTOKEN`, JWT bearer tokens must not appear in the `apiData` payload sent to Percy or in any socket emission to the extension (PR #2102). The cookie-banner overlay flow currently does inject `aiAuthToken` into `apiData` to Percy — this is a known exception that should not be extended to new flows; new AI features must route the AI Service call through `ip-protection`, not through Percy.
- **Never expose API keys or AI credentials in `apiData` fields, response bodies, or socket events.** If a value comes from `keys.yml`, it stays in `ip-protection` process memory.

## Auth (ip-protection)

- **No new HTTP route or socket event without auth.** Pick one of the 4 middlewares from `utils/middleware.js`: `verifySocketAuthToken`, `verifyAPIAuthToken`, `verifyAutomationAuth`, `verifyBasicAuth`.
- **Never re-implement JWT verification.** The internal `verifyToken(token)` helper (not exported) is the single decoder. It tries `JWT_TOKEN_SECRET` first, falls back to `PREVIOUS_JWT_TOKEN_SECRET` on `JsonWebTokenError` if the previous secret is non-empty. This is the **key-rotation window** — do not remove the fallback without coordinating rotation.
- **Dev escape hatch**: in `IS_DEVELOPMENT_ENV`, `verifyToken` uses `jwt.decode` (no signature verify) and `verifyBasicAuth` short-circuits to `next()`. Do **not** ship code that depends on this behavior in non-dev.
- See `knowledge/docs/flows/auth.md` for the full middleware contract and known `||` vs `&&` bug in `verifyBasicAuth`.

## Input validation

- Validate every external input at the system boundary — Joi schemas on HTTP bodies, type checks on socket payloads.
- Never assume small collections. Apply explicit upper bounds when iterating (this is a `.claude/rules/ip-protection.md` rule in the source repo, repeated here for AI agents).
- No SQL/NoSQL injection vectors (we don't have a relational DB, but the AI candidate API and S3 paths must be sanitized — never interpolate user data into S3 keys without an allowlist).
- No XSS in any HTML the server renders or AI response we forward — always pass through the consolidation pipeline.
- No command injection in `scripts/*.sh` — when scripts shell out with user-provided strings, quote rigorously.

## Redis & S3

- **Every Redis key MUST have a TTL.** No exceptions. Default TTL constants live in `ip-protection/config/constants.js` (`B1_REDIS_EXPIRY`, `B2_REDIS_EXPIRY`, `REDIS_TTL`, `SCAN_STATE_TTL`, `PENDING_STATUS_TTL`, `SCAN_COMPLETE_REDIS_TTL`, `REDIS_EXPIRY`, `TYPE_C_AUTOMATION_TTL`).
- **BullMQ jobs pass IDs, not user data.** Store payloads in Redis under a TTL-bound key, hand the key to the job. Keeps Redis memory bounded per-scan and makes retries cheap.
- S3 keys derived from user input must use server-generated UUIDs (see `IMAGES_DIRECTORY/${uuidv4()}.png` pattern in `utils/s3Utils.js`).

## Submodule discipline

- The `axe-core/` submodule is **BrowserStack's fork**. Never `git submodule update --init` against upstream. The submodule's tracked URL is `git@github.com:browserstack/a11y-engine-axe-core.git` on the `main` branch.
- Every modification inside `axe-core/` must carry a tag comment: `// [tag]: short description` where `[tag]` is `a11y-critical`, `a11y-domforge`, `a11y-ip`, `a11y-core`, or `a11y-rule-<name>`. See `rules/commit-conventions.md`.

## Pre-commit

Pre-commit hook (Husky, see `.husky/`) runs lint-staged: Prettier + ESLint `--fix`. Do not bypass with `--no-verify` unless explicitly required for a hot fix, and follow up with a fix-up commit immediately.

## Common pitfalls (do NOT)

- Do not write a Redis key without `EX`/`PX`/`EXPIRE`. The Redis client wrapper does not auto-TTL.
- Do not put DOM, AI HTML, or asset bytes into a BullMQ job payload — those go to Redis or S3 first.
- Do not call `queue.add(...)` directly. Use `addJobTo*Queue(...)` helpers in `utils/bullmq.js`.
- Do not log success paths in `ip-protection` — they burn the 2-week retention budget.
