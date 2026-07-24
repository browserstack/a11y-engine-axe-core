# Local Setup

The setup story has two paths: **full ecosystem** (recommended) and **standalone**.

## Path 1 — Full ecosystem (recommended)

For developers setting up the entire BrowserStack Accessibility stack (a11y-engine + accessibility + frontend + …), run the umbrella script from the sibling `accessibility` repo:

```bash
cd /path/to/accessibility
./script/macbook-setup/accessibility_setup_script.sh
```

This clones a11y-engine and all related repos, installs dependencies, configures secrets, builds packages and extensions, and sets up Redis and ngrok.

## Path 2 — Standalone (a11y-engine only)

**Requirements** — macOS, VPN connection (for Vault), sudo (for ngrok daemon).

```bash
./scripts/setup.sh <your-github-pat-token>
```

The GitHub PAT needs `write:packages` scope. Generate one at https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens.

The script performs these steps:

1. Install Homebrew, nvm, Node.js **18.20.4**, Grunt, yarn (if missing).
2. Install and configure ngrok (authtoken + autolaunch daemon).
3. Install `redis-stack` and start Redis on port **8883** via launchd.
4. Provision npm auth without writing the PAT into `.npmrc`:
   - The root `.npmrc` is committed and **token-free** — it reads `${NODE_AUTH_TOKEN}`. Do not edit it.
   - Setup writes the PAT to `~/.config/a11y-engine/npm-auth.env` at mode `0600` and appends a one-line source guard to `~/.zshrc`.
   - Copy `config.yml.sample` → `ip-protection/config/config.yml`, `keys.yml.sample` → `ip-protection/config/keys.yml`.
5. Fetch secrets from Vault (Percy token, WebA11y API credentials) and inject into `keys.yml`.
6. Fetch git submodules (`axe-core/` from BrowserStack's fork) and build axe-core via `a11y-engine-core/build/scripts/build_axe.sh`.
7. Install dependencies, run `npx husky install` explicitly (the hardened `.npmrc` sets `ignore-scripts=true` which suppresses the `prepare` hook), and build all packages (`a11y-engine-core`, `ip-protection`, `dom-forge-core`).

## Post-setup — run the backend

Open two terminals in `ip-protection/`:

```bash
# Terminal 1 — Express server, port 8881
cd ip-protection
npm run dev

# Terminal 2 — BullMQ workers (main + AI processes)
cd ip-protection
npm run worker
```

## Node version

```bash
nvm use 18.20.4
```

The `.nvmrc` pins this; running on a newer Node breaks native module compilation (specifically `redis-stack` bindings and some Grunt plugins).

## NPM authentication for `@browserstack` packages

The root `.npmrc` is **committed and token-free** — it resolves the GitHub PAT from `${NODE_AUTH_TOKEN}`. Never paste a PAT into `.npmrc`; a pre-commit hook (`scripts/hooks/check-npmrc-secrets.sh`) blocks any `.npmrc` that contains a literal token.

Provision the token via `setup.sh` (recommended — writes `~/.config/a11y-engine/npm-auth.env` at 0600 and adds a source guard to `~/.zshrc`):

```bash
./scripts/setup.sh <your-github-pat-token>
```

Or, for the current shell only:

```bash
export NODE_AUTH_TOKEN=<your-github-pat-token>
```

The PAT needs `write:packages` scope and access from a maintainer (currently `@jimesh`). After a `git pull`, if a stale token-bearing `.npmrc` was left over from a pre-hardening clone, `git checkout -- .npmrc` restores the committed file.

## Restart services after a reboot

The entire Accessibility ecosystem — including a11y-engine's `ip-protection` backend + workers — is orchestrated by a single script in the sibling `accessibility` repo:

```bash
cd /path/to/accessibility
bash script/macbook-setup/restart_services.sh
```

If services fail to start, **run `/restart-services` in Claude Code from the accessibility repo, not from this one.** The skill and subagent live in the accessibility repo only — they are not duplicated here. The subagent reads each failed service's log, classifies the cause, and walks you through manual environmental fixes (brew installs, port cleanup, file permissions, missing sibling checkouts, ngrok auth, etc.) without editing source code or the script itself.

See `accessibility/.claude/skills/restart-services/SKILL.md` and `accessibility/.claude/agents/restart-services.agent.md` for the full logic.

## Running against the extension

1. Copy `ally_engine_host` from `ip-protection/config/config.yml` into the `frontend` repo at `frontend/apps/accessibility-toolkit/env/environmentConstants.js` as `a11yEngineHost`.
2. Switch to local a11y backend: follow https://browserstack.atlassian.net/wiki/spaces/ENG/pages/4864410381/Steps+to+setup+A11y+locally then run `./scripts/switchA11yEnv.sh local`.

## Building axe-core (manual)

```bash
./a11y-engine-core/build/scripts/build_axe.sh
```

Builds the `axe-core/` submodule into `a11y-engine-core/dist/axe.min.js` and `dom-forge-engine-core.min.js`. These bundles are then uploaded to S3 during release and consumed by Percy at scan time.

## Building a11y-engine-core (manual)

```bash
cd a11y-engine-core
npm install
npm run build
# Output: dist/a11y-engine-core.min.js
```

## NPM package consumption (outside this repo)

```bash
npm install @browserstack/a11y-engine-core
```

Requires `.npmrc` with a PAT. See `README.md` for the full instructions.

## Common setup failures and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `nvm use 18.20.4` fails | nvm not installed or shell init missing | Re-run `scripts/setup.sh` or install nvm manually; `source ~/.nvm/nvm.sh` |
| Vault fetch hangs | Not on VPN | Connect to VPN, re-run |
| Redis "port 8883 in use" | Old Redis still running | `brew services stop redis-stack && brew services start redis-stack` |
| ngrok "auth required" | Authtoken missing | `ngrok config add-authtoken <token>` |
| Submodule init fails | Wrong remote (Deque upstream) | Confirm `.gitmodules` URL points at `git@github.com:browserstack/a11y-engine-axe-core.git`; never re-init against upstream |
| `npm install` ENOAUTH on `@browserstack/*` | `NODE_AUTH_TOKEN` unset in shell | `source ~/.config/a11y-engine/npm-auth.env` or re-run `./scripts/setup.sh <pat>` |
| `git pull` refuses to overwrite local `.npmrc` | Stale token-bearing copy from pre-hardening clone | `mv .npmrc /tmp/npmrc.bak && git pull && ./scripts/setup.sh <pat>` |
| Husky hooks not installed after `npm install` | `ignore-scripts=true` blocks the `prepare` hook | `npx husky install` (explicit, post-install) |
| Grunt missing | Not installed globally | `npm i -g grunt` |
| `karma-cli` missing | Not installed globally | `npm i -g karma-cli` |

For any service-startup failure beyond these: from the **accessibility** repo, run `/restart-services` — see above.
