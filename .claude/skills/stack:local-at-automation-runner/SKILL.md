---
name: stack:local-at-automation-runner
description: Run the BrowserStack WA (accessibility-toolkit) extension automation locally &mdash; run / smoke / demo / debug AT or workflow-analyzer Cucumber scenarios in local Chrome-for-Testing (BStackAutomation a11y/ui suite). Two modes&colon; LOCAL (everything on the local dev stack) and ENV (reg / daily-reg / preprod / prod hosted backends; only the extension is local). No config decryption needed. Covers extension selection from the frontend repo, per-env stored creds, CDP debugging of the panel, and the UI-element map.
argument-hint: "[LOCAL|ENV] [module] [tag]   e.g. 'ENV assisted_test axe_3299'"
---

# Local WA Extension Automation Runner (BStackAutomation `a11y/ui`)

Run `a11y/ui` Cucumber scenarios against a **locally loaded, unpacked** accessibility-toolkit
extension in Chrome-for-Testing. The test wiring lives in the repo; this skill is mode
selection + environment setup + the verified gotchas.

This is the local end-to-end validation loop for a11y-engine changes: pair with
`stack:build-and-run` (build the packages) and `stack:local-extension-builder` (build the WA/AUT
extension against a locally-built `@browserstack/a11y-engine-core`) to test engine/rule changes in
a real extension.

## Step 0 — Discovery & state (first run per machine; reuse after)

Paths and creds differ per user. On first use, DISCOVER and persist them to a
`state.local.json` file **in this skill's own directory** (create it; never commit
anywhere; `chmod 600`). On later runs, read the state file first and only re-verify cheaply.

```jsonc
{
  "bstackautomation_repo": "<abs path>", // find: `ls ~/l/BStackAutomation 2>/dev/null || mdfind -name nw_cucumber_runner.js`
  "frontend_repo": "<abs path>", // find: dir containing apps/accessibility-toolkit
  "env_creds": {
    // per-env login creds — USER fills placeholders;
    "reg": { "email": "<FILL_EMAIL>", "password": "<FILL_PASSWORD>" }, // the agent writes
    "prod": { "email": "<FILL_EMAIL>", "password": "<FILL_PASSWORD>" } // ONLY placeholders.
  }, // Never commit; never log values.
  "last_extension_path": "<abs path to dist>" // convenience default for the next ask
}
```

> ⚠️ The block above is annotated for readability. When you actually write `state.local.json`,
> **strip the `//` comments** — `jq` reads strict JSON only, so the later `jq -r … state.local.json`
> reads (see Run) fail with `jq: parse error` if the comments are left in.

- **Extension build: ASK THE USER EVERY RUN** which extension to load. Default suggestion:
  `<frontend_repo>/apps/accessibility-toolkit/dist` (the FE source lives at
  `<frontend_repo>/apps/accessibility-toolkit`). Alternatives: an unpacked build folder
  anywhere (e.g. a downloaded `8.25.0.0/`). Verify it's a real unpacked extension:
  `manifest.json` present with `"version"`.
- **Creds: the AGENT must NOT write or inline real credentials.** The auto-mode classifier
  blocks persisting a password to a file _and_ inlining `BS_TEST_PASSWORD=…` in a command — so
  credentials are **user-filled** in the skill's cred store, which ships pre-seeded with
  `<FILL_…>` placeholders:
  **`state.local.json` in this skill's directory.**
  Point the user to that file and have them replace the placeholders for the env they're running
  (create it from the schema above with placeholders if missing — placeholders are safe to write;
  real values are not). The run reads them via `jq` from inside a scratch script (see Run) so the
  literal never lands in a tool-call arg. QA fixture accounts only. For the **non-AI** AT flows
  (manual interactive-elements / keyboard review) use an **ai-opt-out** account (keeps AI/NRV
  screens out of the wizard and raises the regression-expected rulesets); the **AI/NRV** cases
  need a separate **AI-enabled** account (`AI_EMAIL`, e.g. the `aia11y*` fixtures). Never commit
  `state.local.json`; never echo values.
- The harness mechanics require the extension path under `~/Downloads/<SCANNER_VERSION>`
  (`cucumber.conf.js` builds `--load-extension=/Users/<user>/Downloads/$SCANNER_VERSION`), so
  whatever the user picks, symlink it: `ln -sfn <chosen-dist> ~/Downloads/<name>` and set
  `SCANNER_VERSION=<name>`.

## Modes

|                        | **LOCAL mode**                                                                                                                                                                                           | **ENV mode**                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Backends               | local dev stack (`accessibility-local.bsstag.com`, `local.bsstag.com`)                                                                                                                                   | hosted env: `reg` / `daily-reg` / `preprod` / `prod` — nothing local except the extension                              |
| Extension build flavor | `npm run build:local` (or `-dynamic`)                                                                                                                                                                    | flavor must match the env (prod build → prod backends, regression build → its bsstag env, `-dynamic` → any bsstag env) |
| Stack prerequisite     | local stack UP (check: `curl -k -s -o /dev/null -w '%{http_code}' https://accessibility-local.bsstag.com` → 200; recovery: `accessibility/script/macbook-setup/restart_services.sh` — walk ALL services) | none                                                                                                                   |
| Auth                   | cookie injection via `local.js` `AUTH_COOKIE` (see LOCAL auth below)                                                                                                                                     | form login with stored env creds via the MANUAL_LOGIN bypass                                                           |
| Config decryption      | **not needed** (placeholder configs) — only decrypt if you specifically need real config values                                                                                                          | **not needed** (placeholder configs)                                                                                   |

**Why no decryption:** `commonHelper.runningTestLocally()` is
`os.userInfo().username !== 'root'` — always true on a dev Mac regardless of PROFILE, so
`--load-extension` fires for ANY profile. The only reason configs must parse is that helpers
`require('configs/$PROFILE.js')` at import time — ciphertext throws
`SyntaxError: Invalid or unexpected token` (surfacing as
`Error importing localHelper/reportingHelper/frameworkHelper`). Fix with **placeholder
configs**, not decryption:

- `configs/common.js` → `module.exports = {};`
- `configs/$PROFILE.js` → plaintext object per `configs/config.template.js`, with the env's
  hosts and `EMAIL: process.env.BS_TEST_EMAIL, PASSWORD: process.env.BS_TEST_PASSWORD`
  (never literals — these files are git-TRACKED; restore after:
  `git checkout -- configs/common.js configs/$PROFILE.js`).
- Env host mapping: `prod` → `URL: https://www.browserstack.com`,
  `ACCESSIBILITY_URL: https://accessibility.browserstack.com`. bsstag envs →
  `https://<env>.bsstag.com` / `https://accessibility-<env>.bsstag.com`
  (daily-reg = `rengg-regression-6-nov-25`, reg = `regression`).

(Optional legacy: real decryption via `ENCRYPTION_PASSWORD` + `npm run decrypt:config` still
works if actual config values are needed; `generate:common:config` hard-requires the vault
`cucumber.yml` — if missing, decrypt only `$PROFILE.js` via
`npx run-func ./node_modules/bstackautomation-helpers/helpers/encryption_helper.js decryptFile "$PW" ./configs/<p>.js`.)

### Second config tree for the wcag_at conformance suite (AXE-3501)

The `@wcag_at` scenarios (`step_definitions/assisted_test/wcag_at_steps.js`,
`I sign-in on extension as the conformance-isolated user`) do NOT use the placeholder
`EMAIL`/`PASSWORD` above — they call `loadMochaUser(PROFILE, 'best_practice_off')`
(`helpers/wap1Credentials.js`), which `require`s a SECOND config tree at
`a11y_engine/sdk/mocha/configs/<mochaProfile>.js` (profile map: `regression → reg`, else
identical). Ciphertext there throws the same import error. Placeholder it too — the sign-in
only reads `best_practice_off_p1wa_email` (username/access_key are validated non-empty but
unused for this flow), and on `preprod`/`prod` the step form-logs with
`browser.globals.PASSWORD` from the `a11y/ui` config:

```js
// a11y_engine/sdk/mocha/configs/<profile>.js — LOCAL ONLY, git-tracked, restore after
module.exports = {
  best_practice_off_p1wa_username: 'x',
  best_practice_off_p1wa_access_key: 'x',
  best_practice_off_p1wa_email: process.env.BS_TEST_EMAIL // never a literal
};
```

Pass creds via env (read from `state.local.json` inside a scratch runner script so the literal
never lands in a tool-call arg — the auto-mode classifier blocks inline
`BS_TEST_PASSWORD='…'`): `export BS_TEST_EMAIL="$(jq -r .env_creds.prod.email state.local.json)"`.

⚠️ **CONTENT-ASSERTION CAVEAT (verified 2026-07-06).** The placeholder route gets the wcag_at
scenarios to _run end-to-end_ (login → set version → wizard → save → dashboard → assert) — good
enough for **structural / split-wiring run-proof**. It does NOT produce **green content
assertions**, because the expected rule sets are **account-configuration-specific**: the suite
is calibrated for the real `best_practice_off` account (best-practice OFF + Advanced ON →
`focus-entirely-obscured` renders at 2.2 AA). Substituting any other account (e.g. the
`ai-opt-out` prod fixture in `state.local.json`) renders an _inverted_ set
(`keyboard-focus-visible` appears, `focus-entirely-obscured` does not) and every present/absent

- tag assertion fails — a stub artifact, NOT a product bug or a split defect. For GREEN content
  proof you need the real `best_practice_off_p1wa_*` values (decrypt the mocha config) on the
  regression env where that account lives — i.e. how CI runs it (`WebA11yUIAutomation`). Don't
  present a stub-account run as content proof.

## Auth

**ENV mode — form login (MANUAL_LOGIN bypass).** Temporary local-only edit in the
`I sign-(in|up) on extension with cookie` step (`extension_steps.js`): when
`MANUAL_LOGIN=true` → `checkFocusAndSwitch()` → `url(\`${URL}/users/sign_in\`)`→`LoginPage.login(EMAIL, PASSWORD, false)`→ settle pause → **post-login window hygiene**
(the extension opens its onboarding docs tab on every fresh profile;`goToAccessibiltyToolKitTab`blindly closes`handles[0]`when handles > 2 — close every
window that is neither the login tab nor`devtools://`, then switch back).
⚠️ **Google SSO does NOT work in automated CfT** (Google blocks OAuth in automated
browsers) — password accounts only.

**LOCAL mode — cookie injection.** `Given I sign-in on extension with cookie` with
`PROFILE=local` + `browser.globals.AUTH_COOKIE` set calls `setupA11YAuthCookie()`
(`helpers/local_auth_cookie_helper.js`), injecting on `.bsstag.com`:
`_authcookie_accessibility_testing` ← `AUTH_COOKIE`, `accessibility_bstack_user_id` ←
`USER_ID`, `fe_oauth_refresh_token` ← `REFRESH_TOKEN`, `fe_oauth_state=1`. Append these as
`module.exports.X = '…'` overrides at the end of the (placeholder) `local.js` — values from a
fresh cookie jar (see the BStackAutomation cookie-recapture runbook). Stale values →
redirected to login. The form-login fallback is unreliable on the local stack (returns
`X-MOBILE-TOKEN`, no Rails session) — prefer cookies. The same stored `env_creds` can seed a
cookie-based login for an env later.

**LOCAL mode — ⚠️ cert flags required.** `auth-local.bsstag.com` has a CN-invalid cert; the
extension's OAuth refresh silently stalls there (symptom: dashboard loads but the AT panel
never advances — start-info modal `div[id*="headlessui-description"]` times out). Add to the
local `chromeOptions.args` in the `@extension` Before hook (local-only edit, do not commit):
`'--ignore-certificate-errors', '--allow-insecure-localhost'`.

## Prerequisites (both modes)

1. **Node 18.18.0** — `source ~/.nvm/nvm.sh && nvm use 18.18.0` (Node 22/24 break helpers).
2. **CfT Chrome + chromedriver version-matched** under `a11y/ui/chrome` + `a11y/ui/chromedriver`
   (`npm run setup:chrome`); `src/scripts/localChrome.js` wires them into `nightwatch.conf.js`.
3. Extension symlinked into `~/Downloads/<SCANNER_VERSION>` (Step 0).

## Run

```bash
cd <bstackautomation_repo>/a11y/ui
source ~/.nvm/nvm.sh && nvm use 18.18.0
# ENV mode (detached — a tool timeout must never kill the run mid-flow).
# Read creds from state.local.json (strict JSON, no comments) so the literal never lands in a
# command arg; the exported vars are inherited by the `nohup env` child below (do NOT inline them):
export BS_TEST_EMAIL="$(jq -r .env_creds.<env>.email <skill-dir>/state.local.json)"
export BS_TEST_PASSWORD="$(jq -r .env_creds.<env>.password <skill-dir>/state.local.json)"
nohup env MANUAL_LOGIN=true LOCAL_CDP_DEBUG=true \
  PROFILE=<profile-config-name> BROWSER=chrome SETUP_NAME=default SCANNER_VERSION=<symlink-name> \
  MODULE_OR_PRODUCT=assisted_test PRIORITY=<tag> \
  node ./nw_cucumber_runner.js > run.log 2>&1 &
# LOCAL mode: same but PROFILE=local, no MANUAL_LOGIN/BS_TEST_* (cookie auth), SCANNER_VERSION=<local build symlink>
```

- `SETUP_NAME=default` (NOT `extension` — that env doesn't resolve chromedriver);
  `BROWSER=chrome` (runner splits on `_`).
- `PRIORITY=<any tag>` → `(@chrome and @<tag>) and not (@wip or @no_run …)`. **Smoke ONE
  scenario first** — auth/config failures hit the Background, so every scenario fails
  identically; one scenario tells you fast.
- `MODULE_OR_PRODUCT` mainly names the rerun-file/Redis key; the tag does selection.
- Headed Chrome appears; full AT scenario ≈ 7–9 min.

### Known AT regression suites & exact invocations (verified 2026-07-07)

| Suite                                       | Feature file / tag                                                                         | Account                                                 | Env vars (+ the common `PROFILE=prod BROWSER=chrome SETUP_NAME=default MANUAL_LOGIN=true SCANNER_VERSION=<symlink>`) | Verified                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Interactive Elements (AXE-3230), **non-AI** | `features/assisted_test/interactive_elements_at.feature` — `@axe_3299` (11 scenarios)      | **ai-opt-out** (non-AI)                                 | `MODULE_OR_PRODUCT=assisted_test PRIORITY=axe_3299`                                                                  | **11/11 PASS on prod, 2026-07-07** (base-rebase extension) |
| Interactive Elements **AI/NRV** (ATA-1031)  | `features/ai/assisted_test/ai_interactive_elements_nrv.feature` — `@interactive_at_ai_nrv` | **AI-enabled** (`AI_EMAIL` / `aia11y*`), NOT ai-opt-out | `MODULE_OR_PRODUCT=ai PRIORITY=interactive_at_ai_nrv` (NRV flag on)                                                  | not run here — needs AI env                                |

- The `@axe_3299` cases live **ONLY** on the `a11y/axe-3299-3230-presentation-state-leak-tests` branch (0 on AXE-3501) — stash other WIP + check out that branch first, then re-apply the local scaffolding (placeholder configs + MANUAL_LOGIN + frame-fix) fresh, since branch-switch drops them.
- `PRIORITY=axe_3299` runs the whole set; a unique sub-tag runs ONE for the initial smoke: `axe_3299_presentation_not_interactive`, `_presentation_placeholder`, `_no_role_found_label`, `_customs`, `_s3`, `_s7`, `_s8`, `_s10`.
- **AI vs non-AI is account-gated in the feature files**: manual scenarios sign in via the plain `I sign-in on extension with cookie` (→ standard/ai-opt-out `EMAIL`); AI scenarios use `...using ai default user` / `with AI user` (→ `AI_EMAIL`). Same feature file (`ai_interactive_elements_nrv.feature`) even splits its own scenarios this way (`@nrv_e2e` → AI user, `@nrv_flag_gating` → standard user).
- CDP (`LOCAL_CDP_DEBUG`) is **optional** — the 11/11 prod run above ran without it. Only add the CDP gate when you need to read the panel DOM.

### Reading a run (three evidence streams)

- **run.log**: spammed by `Created NEW WebDriver instance` — always `grep -v`. Verdict:
  `grep "Scenario ended:.*Status:"`. Soft-assert failures = `•` bullets at scenario end.
- **`a11y/ui/logs/tests.log`**: `logger.info` markers land HERE, not stdout.
- **CDP topology JSONL** (below): which targets exist/die at any moment.
- **Full-suite run (multiple scenarios ≈ 30–40 min)** — run detached and wait on the _process_,
  not a fixed sleep: `echo $! > run.pid` right after the `nohup … &`, then poll
  `kill -0 "$(cat run.pid)" 2>/dev/null || break` in a background loop. Final verdict:
  `grep -E "Scenario ended:.*Status:" run.log` (count `PASSED`/`FAILED`). The full `@axe_3299`
  set = 11 scenarios ≈ 35 min. Strip ANSI in reports with `sed -E 's/\x1b\[[0-9;]*m//g'`.

## CDP debugging — read the panel DIRECTLY, no test-injected scripts

Gate: add to local `chromeOptions.args` (local-only edit):
`...(process.env.LOCAL_CDP_DEBUG === 'true' ? ['--remote-debugging-port=9222'] : [])`.

**Key fact:** the extension's AT panel iframe (`chrome-extension://<id>/index.html?tabId=…`)
is **its own CDP target** with its own `webSocketDebuggerUrl` — so its DOM is readable
directly over CDP, no `executeScript` injection in the test needed:

- Enumerate targets: `curl -s http://127.0.0.1:9222/json/list` (page tabs, DevTools windows,
  the panel iframe, workers). ⚠️ `127.0.0.1`, NOT `localhost` — Node 18 `fetch` resolves
  localhost to IPv6; Chrome listens on IPv4 only (curl works, node silently fails).
- Read the panel DOM: `node cdp_eval.js 'index.html?tabId' 'document.body.outerHTML'`
  (or headings/buttons expressions). The panel target exists only once the Accessibility
  Toolkit tab is selected in DevTools.
- Screenshot any target via `Page.captureScreenshot` on its WS.
- The in-test `executeScript` dump (h2/h3/buttons via `webDriverHelper`) is the FALLBACK for
  runs without CDP enabled.

Helper scripts (drop in a scratch dir, Node 18+; `ws` pkg is in `a11y/ui/node_modules`):

```js
// cdp_monitor.js — one JSONL line per target-set change; run alongside the test
const POLL_MS = 1000;
let last = '';
const summarize = ts =>
  ts
    .map(t => ({
      id: t.id.slice(0, 8),
      type: t.type,
      title: (t.title || '').slice(0, 80),
      url: (t.url || '').slice(0, 120)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
async function tick() {
  try {
    const targets = await (
      await fetch('http://127.0.0.1:9222/json/list')
    ).json();
    const snap = JSON.stringify(summarize(targets));
    if (snap !== last) {
      last = snap;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          targets: JSON.parse(snap)
        })
      );
    }
  } catch (e) {
    const m = `unreachable: ${e.message}`;
    if (last !== m) {
      last = m;
      console.log(JSON.stringify({ ts: new Date().toISOString(), error: m }));
    }
  }
}
setInterval(tick, POLL_MS);
tick();
```

```js
// cdp_eval.js — usage: node cdp_eval.js <url-substring> <expression>
const WebSocket = require('<bstackautomation_repo>/a11y/ui/node_modules/ws');
const [, , match, expr] = process.argv;
(async () => {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = targets.find(t => (t.url || '').includes(match));
  if (!target) {
    targets.forEach(t => console.error(`[${t.type}] ${t.url}`));
    process.exit(2);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.on('open', () =>
    ws.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true }
      })
    )
  );
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id === 1) {
      console.log(JSON.stringify(m.result, null, 2));
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(3), 10000);
})();
```

## UI-element map — grow it every session

`references/ui-element-map.md` (next to this skill) maps UI elements → selector → FE source
component. **Whenever you locate an element** (via CDP dump, FE code reading in
`<frontend_repo>/apps/accessibility-toolkit/src/`, or a locator hunt), APPEND a row there —
it compounds into instant answers for future runs. Read it BEFORE hunting for any element.

Ground AT screens in the FE source, not stale locator comments: per-AT screens live in
`src/devtools/AT/components/<KeyboardAT|…>/components/ReviewSteps/` (`constants.js` = step
enum, `StepScreens/*.jsx` = exact headings). Check which FE branch the dist was built from
(`git -C <frontend_repo> rev-parse --abbrev-ref HEAD`) and the matching PR for intended
behavior. Read counts/labels off a live run, not memory — they drift across releases.

## Failure signatures (all verified 2026-07-02/03)

| Symptom                                                                                                                                                                                                                                                                              | Cause                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid or unexpected token` importing helpers; `getScenarioName` of undefined                                                                                                                                                                                                      | `require('configs/<PROFILE>.js')` hit ciphertext (also via symlinked node_modules → main clone in worktrees)                         | placeholder configs where node_modules really lives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| start-info modal times out; dashboard loads but AT won't advance (LOCAL)                                                                                                                                                                                                             | `auth-local.bsstag.com` CN-invalid cert stalls OAuth refresh                                                                         | `--ignore-certificate-errors --allow-insecure-localhost`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Extension path not found: ~/Downloads/<SCANNER_VERSION>`                                                                                                                                                                                                                            | symlink/dist missing                                                                                                                 | re-symlink chosen dist (Step 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| session won't start / chromedriver version error                                                                                                                                                                                                                                     | CfT vs chromedriver mismatch, or `SETUP_NAME=extension`                                                                              | `npm run setup:chrome`; `SETUP_NAME=default`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TypeError: … null (reading 'includes')` in a URL poll                                                                                                                                                                                                                               | `getCurrentUrl()` null mid-redirect                                                                                                  | `(await getCurrentUrl()) \|\| ''`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Login "detected" though nobody logged in                                                                                                                                                                                                                                             | Google-SSO click navigates off `/users/sign_in` → URL-poll false positive                                                            | form login; never Google SSO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `verifyLogin → switchToIframe` 3× "**error** while locating" (vs "not found") while the panel target is alive in topology — often after a first attempt that DID find the iframe+header then a window closed (`no such window: target window already closed` / `web view not found`) | driver parked on a DEAD window handle; `switchToIframe`'s retry loop resets only the FRAME (`switchToFrame(null)`), never the window | in `extension_page.js` `switchToIframe`, call `this.switchToToolkit()` (already implements exactly this re-anchor: iterate `getAllHandles()`, switch to the LAST `DevTools`-titled window) BEFORE the `switchToFrame(null)` reset inside the `catch`. Verified 2026-07-06, and **RE-VERIFIED 2026-07-07** — it recovered the flake mid-scenario during the full `@axe_3299` prod run (11/11 PASS). NOTE: a **fresh branch** (e.g. the `a11y/axe-3299-3230-presentation-state-leak-tests` automation branch) does NOT have the re-anchor — add it manually into the `try` before the first `switchToFrame(null)` (inline: `getAllHandles()` → switch to the LAST `DevTools`-titled handle, wrapped in its own try/catch). Local debug edit — the underlying flake also merits a committed fix via review |
| Extension save works but dashboard opens the WRONG report                                                                                                                                                                                                                            | saved-reports list shared across parallel runs + first-page row matching                                                             | search list by report name first (`SEARCH_REPORT` = `[data-testid="report-listing-search-input"]`, then name-keyed dynamic row locator)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `clickOnLogin` 10s timeout                                                                                                                                                                                                                                                           | benign — already authed, button absent (in `try`)                                                                                    | ignore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| redirected to login (LOCAL)                                                                                                                                                                                                                                                          | stale `AUTH_COOKIE`/`REFRESH_TOKEN`                                                                                                  | recapture cookie jar, repatch `local.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Worktree trap (advanced)

Symlinked `node_modules` in a worktree: `framework_helper.js` does
`require('../../../configs/<PROFILE>.js')` relative to the package's REAL path → resolves to
the MAIN clone's `configs/`. Both the worktree's AND the main clone's configs must parse
(placeholder or decrypted). Restore via `git checkout -- configs/...` in both.

## Cleanup checklist (after a debug session)

All of these are LOCAL-ONLY edits — never commit: placeholder `configs/common.js` +
`configs/$PROFILE.js` (restore: `git checkout -- …`), the MANUAL_LOGIN bypass in
`extension_steps.js`, the `LOCAL_CDP_DEBUG` arg in `cucumber.conf.js`, cert flags. Genuine
robustness fixes discovered along the way (e.g. the `switchToIframe` DevTools re-anchor, the
saved-reports name search) should be committed separately through review.

## Related skills

- `stack:build-and-run` — build the a11y-engine packages (a11y-engine-core, ip-protection) locally.
- `stack:local-extension-builder` — build the WA/AUT extension against a locally-built
  `@browserstack/a11y-engine-core` (produces the `dist` this skill loads). Added in parallel via
  PR #1760 — may not yet be on `main`.
- `stack:debug-fp` — live-page false-positive investigation once a rule change is loaded.
- BStackAutomation `a11y/ui` cookie-recapture runbook — refresh the LOCAL-mode `AUTH_COOKIE` jar.
