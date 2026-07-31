# Dependencies

## Root-level (`package.json`)

The repo root is `"private": true` (not published). It carries dev-tooling only — Husky, lint-staged, ESLint, Prettier — plus three runtime deps used by the linter and release tooling (`csv-parser`, `ws`, `xlsx`).

| Category                                | Packages                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dev (lint / format / Husky)             | `eslint`, `eslint-config-airbnb-base`, `eslint-config-prettier`, `eslint-formatter-table`, `eslint-plugin-import`, `eslint-plugin-prettier`, `eslint-plugin-simple-import-sort`, `eslint-plugin-sonarjs`, `babel-eslint`, `husky`, `lint-staged` |
| Runtime (lint and release tooling only) | `csv-parser`, `ws`, `xlsx`                                                                                                                                                                                                                       |

Node engine: `>=18.0.0` enforced via `engines.node`. The `.nvmrc` pins **18.20.4** for the entire repo.

## Per-package dependency profile

### `a11y-engine-core/`

Browser-context audit engine. Built with **Grunt**. Published as `@browserstack/a11y-engine-core` on GitHub Packages.

| Category | Typical packages                                                         |
| -------- | ------------------------------------------------------------------------ |
| Build    | `grunt` and Grunt plugins, `babel`, `karma`, `karma-mocha`, `karma-chai` |
| Test     | Mocha + Chai inside Karma                                                |
| Runtime  | Imports forked axe-core via the `axe-core/` submodule build output       |

The build pipeline runs `./build/scripts/build_axe.sh` first (which builds the axe-core submodule), then `npm install && npm run build` produces `dist/a11y-engine-core.min.js`.

### `ip-protection/`

Node 18 backend. Express + socket.io + ioredis + AWS S3 SDK + BullMQ. Tested with Jest.

| Category         | Typical packages                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP             | `express`, `body-parser`, `compression`, route helpers                                                                                                                                                                                                                           |
| Socket           | `socket.io` (with `maxHttpBufferSize: 3 MB`)                                                                                                                                                                                                                                     |
| Redis            | `ioredis` — primary + read-replica connection in `config/constants.js`. `REDIS_OPTIONS.reconnectOnError` is centralised on `READONLY` errors so any client (`getClient`, BullMQ, cache layers) recovers from elasticache primary→replica failover without per-call hand-rolling. |
| Queues           | `bullmq`                                                                                                                                                                                                                                                                         |
| Storage          | `@aws-sdk/client-s3`, optional CloudFront signed URLs (`@aws-sdk/cloudfront-signer`)                                                                                                                                                                                             |
| Validation       | `joi`                                                                                                                                                                                                                                                                            |
| Logging          | `winston` + Chitragupta wrapper in `utils/logger.js`                                                                                                                                                                                                                             |
| AI / HTTP client | `axios` (wrapped in `controllers/apiClient.js`)                                                                                                                                                                                                                                  |
| Auth             | `jsonwebtoken`                                                                                                                                                                                                                                                                   |
| Config           | YAML loader for `config.yml` + `keys.yml`                                                                                                                                                                                                                                        |

Test runner: **Jest** (`test/**/*.test.js`).

### `dom-forge-core/`

Browser-context DOM interaction + Percy rule runtime. Built with **Grunt**. Published as `@browserstack/dom-forge-percy-core`.

| Category | Typical packages                                                 |
| -------- | ---------------------------------------------------------------- |
| Build    | `grunt` and plugins                                              |
| Test     | Mocha (`test/checks/*.js`, `test/*Spec.js`)                      |
| Runtime  | Imports compiled axe at runtime via S3 URL — does not bundle axe |

### `mini-percy-renderer/`

Local Percy snapshot replay. **Darwin-arm64 only.** Small utility — minimal dependencies. The key script is `scripts/run-with-axe.js`.

### `axe-core/`

**Git submodule** — `git@github.com:browserstack/a11y-engine-axe-core.git` on the `main` branch. Never modified directly without explicit approval. Carries axe-core's own `package.json` from the fork.

## External services and config touch points

| Service         | How it's reached                                                                                                                                                                                                                                        | Where the config lives                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Percy           | Outbound `POST ${CONFIG.percy.endpoint}/dom_forge` from `controllers/getProxyMap.js`. Authorization: `Token token=<percy.secret>`.                                                                                                                      | `ip-protection/config/config.yml` (`percy.endpoint`, `percy.secret`)  |
| AI API          | Outbound `axios` via `controllers/apiClient.js:getAIResponse`. Authorization: `Basic <BASIC_AI_AUTHTOKEN>` (`${CONFIG.ai.username}:${CONFIG.ai.password}` base64-encoded). Inbound webhooks verify against rotating `BASIC_WEBHOOK_AUTHTOKEN_0` / `_1`. | `ip-protection/config/keys.yml` (`ai.username`, `ai.password`)        |
| WebA11y backend | Outbound `POST a11y[host_${region}]/api/a11y_engine_jobs` from `apiClient.js:sendResponse`. Authorization: `Basic <BASIC_AUTHTOKEN>`.                                                                                                                   | `ip-protection/config/config.yml` (host map), `keys.yml` (token)      |
| Vault           | Secret retrieval via VPN at setup time only. Output is written to `keys.yml`.                                                                                                                                                                           | `scripts/setup.sh` invokes Vault CLI                                  |
| S3 (regional)   | `utils/s3Utils.js`: `s3client` (standard) and `s3clientWithAcceleration` (preprod/production/dr). Per-region routing via `getGrrRegionFromScopeKey`.                                                                                                    | `config/config.yml` (`OCR.images_bucket`, region map)                 |
| CloudFront      | Optional URL signing for asset PUTs. Required when `useRouting: true` on `createPutPresignedUrl()`.                                                                                                                                                     | `config/keys.yml` (`cloudfront.keypair_id`, `cloudfront.private_key`) |
| Jenkins         | Release-time job triggers (`A11yEngineProductionPackagePublish`, `A11yUploadRules`, `BuildProductTools`, `A11yUploadExtension`, `A11yEngineStagingPackagePublish`).                                                                                     | `ip-protection/config/keys.yml` (`jenkins.username`, `jenkins.token`) |
| ngrok           | Dev-only. Forwards local port 8881 to a public URL so Percy and AI webhooks can reach the laptop.                                                                                                                                                       | `scripts/setup.sh` configures the daemon                              |

## Sibling repos (release coupling)

The release script (`scripts/bumpA11yEngine.sh`) touches and creates PRs against:

| Repo            | What gets touched                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility` | `db/rules/a11y_engine_${VERSION}.json` — new file per release; `consolidated_rules.json` from `a11y-engine-core` is copied here. |
| `frontend`      | `apps/accessibility-toolkit/package.json` (version bump), `apps/accessibility-toolkit-headless/package.json` (version bump).     |

The `accessibility` repo also owns the umbrella setup script (`script/macbook-setup/accessibility_setup_script.sh`) and the `restart-services` skill (a11y-engine doesn't duplicate that skill — when services fail to start, run `/restart-services` from the accessibility repo).

## Package governance

- **No new packages from Deque.** Use BrowserStack's forked axe-core APIs only.
- **No TypeScript** — the entire stack is JavaScript.
- **No `pnpm` or `yarn`** — npm only.
- **Submodule URL** — must stay `git@github.com:browserstack/a11y-engine-axe-core.git`. Do not re-init against upstream.
