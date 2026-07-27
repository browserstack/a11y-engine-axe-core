---
name: stack:local-extension-builder
description: For a11y-engine devs&colon; build a BrowserStack a11y Chrome extension locally so engine/rule changes can be validated in a real browser. Asks three things &mdash; which extension (WA = `accessibility-toolkit`, AUT = `accessibility-toolkit-headless`), which backend (local dev stack via ngrok, or a hosted env like preprod/qa/regression/prod), and whether you're testing local `@browserstack/a11y-engine-core` changes (only then do we build the engine and `file:`-link it &mdash; otherwise we build against the published package pinned in package.json). Then runs install &rarr; build &rarr; verify the axe bundle + engine scripts land in the extension dist. Use to build or rebuild the WA or AUT extension against a local engine or any env.
argument-hint: '<WA|AUT> [local|<env>] [--engine|--published] [--no-zip|--engine-only|--skip-axe]'
---

# a11y-engine Local Extension Builder

For a11y-engine devs who need to **build a BrowserStack a11y Chrome extension locally** — so an engine/rule change (RGAA / WCAG / AT) takes effect in a real browser scan, or just to produce a build pointed at a chosen environment. Run it whenever the ask is "build/rebuild the WA (or AUT) extension".

Both extensions live in the same `frontend` repo and share one build flow. The success gate is **Step 6**: the final `dist/` must contain the a11y-engine-core scripts and (for a local-engine build) the **full** axe bundle (~854 KB chunk, not a 917 B stub).

## Step 0 — Scope the build (ASK the user three things)

The three answers decide which steps run. If the argument already supplies them, skip the prompt.

1. **Which extension?** → sets `<extension>` (the app dir under `<frontend_repo>/apps/`).

   | Choice                              | `<extension>`                    | Engine keys in its `package.json`                                                                |
   | ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
   | **WA** (WebA11y)                    | `accessibility-toolkit`          | `@browserstack/a11y-engine-core` **and** `@browserstack/a11y-engine-core-at`                     |
   | **AUT** (Automated Tests, headless) | `accessibility-toolkit-headless` | `@browserstack/a11y-engine-core` **only** (no `-at`; headless carries no Assisted-Test metadata) |

2. **Which backend?** → sets the build target and whether the ngrok pre-flight (Step 1) applies.
   - **Local dev stack** (`dev_local` mode, reaches local `ip-protection` :8881 through an ngrok tunnel) → do Step 1.
   - **A hosted env** (`preprod` / `qa` / `regression` / `dr` / `prod` / …) → skip Step 1; build with that env's `build-package:<env>` script (Step 5).

3. **Are you testing local `@browserstack/a11y-engine-core` changes?** → decides whether we touch the engine at all.
   - **Yes — validating your working-copy engine** → build the engine (Step 2) and `file:`-link it (Step 3). **This is the ONLY case that needs file-linking.**
   - **No — just building the extension as shipped** → **skip Steps 2 and 3**; build against the published engine version already pinned in `package.json`. (If a prior local-engine build left a `file:` edit in `package.json`, restore it first: `git checkout -- apps/<extension>/package.json`.)

### Which steps run

| Answer                 | Steps                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| always                 | Step 0 (scope) → Step 4 (install) → Step 5 (build) → Step 6 (verify) |
| backend = local        | + Step 1 (ngrok pre-flight)                                          |
| backend = hosted env   | (skip Step 1)                                                        |
| engine = test local    | + Step 2 (build engine) + Step 3 (`file:`-link)                      |
| engine = use published | (skip Steps 2–3)                                                     |

## Layout

| Piece                | Path                                                  | Node                                                 |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Engine               | `<a11y_engine_repo>/a11y-engine-core`                 | **18.20.4** (`.nvmrc` in a11y-engine)                |
| axe-core (submodule) | `<a11y_engine_repo>/axe-core`                         | 22.15.0 (build_axe.sh switches internally)           |
| WA extension         | `<frontend_repo>/apps/accessibility-toolkit`          | **22.15.0** (frontend `.nvmrc`), pnpm via `corepack` |
| AUT extension        | `<frontend_repo>/apps/accessibility-toolkit-headless` | **22.15.0** (frontend `.nvmrc`), pnpm via `corepack` |

Paths are **per-machine** — substitute your own absolute checkout paths: `<a11y_engine_repo>` = your local `a11y-engine` clone, `<frontend_repo>` = your local `frontend` clone.

> **Local-only / DO NOT MERGE overrides** — never push them: the `file:` package.json edit (only when testing a local engine, Step 3) and the `dev_local` ngrok host edit (only for a local backend, Step 1). They are uncommitted on purpose; restore with `git checkout -- …` after (Recovery).

---

## Step 1 — Pre-flight: ngrok drift (LOCAL backend only)

Skip entirely for a hosted-env build. Each app's `dev_local` build bakes a hardcoded a11y-engine host into `env/environmentConstants.js` (fed through its `createEnvConfig`). If it's stale, the built extension can't reach local `ip-protection` (:8881). **The two apps express this host differently:**

| Extension                                  | Env var the host feeds                                           | How `DEV_LOCAL` sets `a11yEngineHost`                                           | Default                                 | Edit point for ngrok                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **WA** (`accessibility-toolkit`)           | `VITE_A11Y_ENGINE_SERVICEHOST_URL` + `VITE_A11Y_ENGINE_BASE_URL` | **inline string literal** in the `DEV_LOCAL: createEnvConfig({…})` block        | `'a11y-engine-dev.bsstag.com'`          | change the `a11yEngineHost:` literal in the `DEV_LOCAL` block                                                                     |
| **AUT** (`accessibility-toolkit-headless`) | `BSTACK_A11Y_ENGINE_HOST_URL`                                    | references the **module constant** `DEV_A11Y_ENGINE_HOST_URL` near the file top | `'a11y-engine-terminal-dev.bsstag.com'` | **override the `a11yEngineHost:` line in `DEV_LOCAL`** with your ngrok host — do NOT edit the shared const (`DEV` mode reuses it) |

```bash
# live tunnel(s):
curl -s http://127.0.0.1:4040/api/tunnels \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).tunnels.forEach(t=>console.log(t.public_url,"->",(t.config||{}).addr))}catch(e){console.log("ngrok not running")}})'
# find the host in the chosen extension (DEV_LOCAL block + AUT's constant):
grep -nE "a11yEngineHost:|DEV_A11Y_ENGINE_HOST_URL" <frontend_repo>/apps/<extension>/env/environmentConstants.js
```

If ngrok isn't running, start it (`ngrok http 8881`) and set the `DEV_LOCAL` `a11yEngineHost` (per the table) to the current `*.ngrok-free.app` host. A build with a stale/missing host still _succeeds_ — it just won't connect. Flag it.

## Step 2 — Build the engine (Node 18) — LOCAL-ENGINE builds only

Skip for a published-engine build. Identical regardless of which extension — the engine is shared and built once.

```bash
. "$HOME/.nvm/nvm.sh" && nvm use 18.20.4
cd <a11y_engine_repo>/a11y-engine-core
./build/scripts/build_axe.sh   # builds the axe-core submodule (it switches to Node 22 internally, then back to 18)
npm run build                  # grunt → dist/  (picks up lib/ changes)
```

- **`build_axe.sh` is skippable** (`--skip-axe`) only if `../axe-core/axe.min.js` exists AND the axe-core submodule hasn't changed since it was last built. `npm run build`'s `copy:axe` task just copies the prebuilt axe bundles into `dist/`. If the submodule commit moved (e.g. after `git submodule update`), **run it**.
- Expected engine `dist/` (full fork — NOT stubbed):
  - `axe.min.js` ≈ **627 KB** (a ~917 B file = tree-shaken stub → wrong, do not propagate)
  - `axe.js` ≈ 1.29 MB · `a11y-engine-core.js` ≈ 387 KB · `a11y-engine-core.min.js` ≈ 192 KB · `percyDom.js` = **42009 B**
  - `extension-kit/index.js` (re-exports AT `RULE_INFO`) and `devtools/` present

```bash
cd <a11y_engine_repo>/a11y-engine-core/dist
for f in axe.min.js a11y-engine-core.min.js percyDom.js extension-kit/index.js; do printf "%-30s %s B\n" "$f" "$(stat -f '%z' "$f")"; done
[ "$(stat -f '%z' axe.min.js)" -gt 400000 ] && echo "axe FULL ✓" || echo "axe STUB ✗"
```

Stop here if `--engine-only`.

## Step 3 — `file:`-link the engine in the chosen app's package.json — LOCAL-ENGINE builds only

Skip for a published-engine build (leave `package.json` as-is; the pinned published version is what you want). Otherwise edit `<frontend_repo>/apps/<extension>/package.json` so the engine key(s) point at the **same** local engine dir with a plain absolute `file:` (NOT the `npm:@…@file:` alias form — it produces a dangling AT symlink). Link exactly the keys that exist in that app (Step 0):

```jsonc
// WA (accessibility-toolkit) — BOTH keys:
"@browserstack/a11y-engine-core":    "file:<a11y_engine_repo>/a11y-engine-core",
"@browserstack/a11y-engine-core-at": "file:<a11y_engine_repo>/a11y-engine-core",

// AUT (accessibility-toolkit-headless) — the non-AT key ONLY:
"@browserstack/a11y-engine-core":    "file:<a11y_engine_repo>/a11y-engine-core",
```

On WA, `-core-at` is **not** a separate AT build — it's the same `a11y-engine-core` package (its `extension-kit` carries AT rule metadata); pnpm tolerates the name mismatch on the `-at` key and links both to one store entry. AUT has no `-at` key, so link only `-core`. Back up the original line(s) first (`cp package.json package.json.bak.localbuild`).

## Step 4 — Install (Node 22)

```bash
cd <frontend_repo>
. "$HOME/.nvm/nvm.sh" && nvm use            # → v22.15.0
corepack pnpm install --filter <extension>...
```

- `<extension>` = `accessibility-toolkit` (WA) or `accessibility-toolkit-headless` (AUT).
- Use **`corepack pnpm …`** — a blanket `Bash(pnpm:*)` deny in settings can block bare `pnpm`.
- **Published-engine build:** this just installs the pinned `@browserstack/a11y-engine-core` from the registry — nothing else to do; go to Step 5.
- **Local-engine build:** pnpm normalizes the `file:` path to the lockfile spec `…@file:../a11y-engine/a11y-engine-core` and hardlinks `node_modules/.pnpm/@browserstack+a11y-engine-core@file+..+a11y-engine+a11y-engine-core/` to the engine `dist/` — so later engine rebuilds are picked up without re-copying. Verify the linked dep(s) resolve local (WA both keys; AUT only `-core`):

```bash
cd <frontend_repo>
for d in @browserstack/a11y-engine-core @browserstack/a11y-engine-core-at; do
  p="apps/<extension>/node_modules/$d"
  [ -e "$p" ] || { echo "$d → not present (expected for AUT)"; continue; }
  cmp -s "$p/dist/a11y-engine-core.min.js" <a11y_engine_repo>/a11y-engine-core/dist/a11y-engine-core.min.js \
    && echo "$d → local ✓" || echo "$d → MISMATCH/BROKEN ✗"
done
```

## Step 5 — Build the extension (Node 22)

Pick the `build-package:<target>` script for your chosen backend, run from the app dir:

```bash
cd <frontend_repo>/apps/<extension>
. "$HOME/.nvm/nvm.sh" && nvm use
corepack pnpm run build-package:<target>     # zips dist → <manifest.version>-<target>.zip
# unpacked dist only, no zip: corepack pnpm run build:<target>
```

`build-package:<target>` = `build:<target>` (`vite build --mode <mode> && ./scripts/percy.sh`) + the packaging/zip script. `percy.sh` copies the engine's `percyDom.js` into `dist/`, so a local `file:` link must be live first. **The script names differ per app** — discover with `corepack pnpm run | grep build-package`:

| Backend                                  | WA target        | AUT target                              |
| ---------------------------------------- | ---------------- | --------------------------------------- |
| local (ngrok, `dev_local`)               | `local`          | `local`                                 |
| preprod                                  | `preprod`        | `preprod`                               |
| qa                                       | `qa`             | `qa`                                    |
| regression                               | `regression`     | `regression` ⚠️ (broken — see Gotcha 8) |
| dr (daily-reg)                           | `dr`             | `dr`                                    |
| staging                                  | `stag`           | `dev-staging`                           |
| prod                                     | `prod`           | `production`                            |
| (WA-only) regressiona11y · (AUT-only) th | `regressiona11y` | `th`                                    |

(Safari variants exist on WA as `…:safari`.)

## Step 6 — Verify the final dist (the success gate)

```bash
cd <frontend_repo>/apps/<extension>
# axe bundle — for a LOCAL-ENGINE build this MUST be the full ~854 KB chunk, NOT a ~917 B stub:
for f in dist/assets/js/axe.min.js-*.js; do echo "$f $(stat -f '%z' "$f") B"; done
# engine chunk (~270 KB) + percyDom (42009 B):
for f in dist/assets/js/a11y-engine-core.min.js-*.js dist/percyDom.js; do echo "$f $(stat -f '%z' "$f") B"; done
node -e 'const m=require("./dist/manifest.json");console.log("manifest:",m.name,"v"+m.version)'
ls -lat *-*.zip | head -1
# for a LOCAL backend, confirm the ngrok host baked in:
grep -rl "ngrok-free.app" dist/assets/js/ | head
```

**Pass** = engine chunk present (~270 KB), `dist/percyDom.js` = 42009 B, `manifest.json` name matches the built mode (`[DEV_LOCAL]` for a local build). For a local-engine build, also require the axe chunk > 400 KB (full). Load `dist/` as an unpacked extension in Chrome (or install the zip). The axe-stub failure below is specific to from-source local-engine builds — a published-engine build ships a correct axe bundle already.

---

## Gotchas

1. **axe tree-shake stub (917 B vs ~854 KB)** — local-engine builds only. When vite bundles a from-source engine it can tree-shake the axe global to a 917 B wrapper → `axe is not defined` in Type A/C at runtime. Fix: copy the engine's real axe over it: `cp node_modules/@browserstack/a11y-engine-core/dist/axe.min.js dist/assets/js/axe.min.js-<hash>.js`
2. **pnpm permission deny.** Bare `pnpm`/`pnpm run` may be blocked by a `Bash(pnpm:*)` deny (deny > ask > allow). Use `corepack pnpm …`, or bypass: `./node_modules/.bin/vite build --mode <mode> && ./scripts/percy.sh`. The recovery `pnpm install --force` needs interactive approval.
3. **percyDom.** `percy.sh` pulls `percyDom.js` from the resolved `node_modules` into `dist/`. If you run `vite build` directly (bypassing pnpm scripts), run `percy.sh` after or `dist/percyDom.js` is missing/stale.
4. **stale `package.json` file: edit.** A "use published" build against a `package.json` still holding a `file:` link silently builds from the old local engine. Restore first: `git checkout -- apps/<extension>/package.json`.
5. **stale vite cache** can pin a bad axe chunk: `rm -rf node_modules/.vite dist/.vite` then rebuild.
6. **Wrong app dir.** WA and AUT sit side by side in `apps/`. Build and verify from the app you chose in Step 0 — a stray `--filter` or `cd` into the other app silently builds the wrong extension.
7. **Don't copy a rebuilt axe into the pnpm store** (the old approach). With the `file:` link the store hardlinks the engine `dist/` directly — just rebuild the engine and the extension picks it up on next `vite build`.
8. **AUT `build-package:regression` is broken (pre-existing repo bug).** In `accessibility-toolkit-headless`, `build-package:regression` runs `pnpm run build:k8s`, but no `build:k8s` script exists there (only `build:regression`) → `Missing script: build:k8s`. Workaround for an AUT regression build: run the pieces directly — `corepack pnpm run build:regression && ./scripts/package.sh -regression` (from the AUT app dir). WA's `build-package:regression` is fine. Not caused by this skill; flag to frontend to fix the script.

## Recovery

```bash
cd <frontend_repo>
# restore the local-only package.json edit when done (or before a published build):
git checkout -- apps/<extension>/package.json
# axe got stubbed in the store → restore the published store axe (needs approval), then re-run Steps 3–5:
corepack pnpm install --force --filter <extension>
```

Also restore the `dev_local` ngrok host edit in `env/environmentConstants.js` (`git checkout -- …`) — local-only, DO NOT MERGE.

## Related skills

- `stack:build-and-run` — the engine / ip-protection build commands this skill's Step 2 wraps.
- `stack:add-rule` / `stack:add-assisted-test` — scaffold the rule/AT changes you then validate in a real extension via this build.
- `stack:local-at-automation-runner` — runs the `BStackAutomation a11y/ui` Cucumber automation against the extension `dist` this skill produces (added in parallel; see PR #1746 — may not yet be on `main`).
