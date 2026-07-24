# proxy-map fallback &mdash; replay the scan-time snapshot

When the live customer URL is unusable &mdash; auth-gated, geo-blocked, removed, or materially changed since the scan &mdash; debug against the exact DOM + assets the scanner saw by replaying them through `mini-percy-renderer`'s `jackproxy`. This is strictly a **fallback** path; prefer the live URL via Claude-in-Chrome when it works.

## How it works

`mini-percy-renderer` ships a local MITM proxy (`jackproxy-darwin-arm64`) that reads a `proxy_map.json` of `origin URL → S3 snapshot URL` mappings. Chrome is launched with `--proxy-server=localhost:8080 --ignore-certificate-errors`. Requests that hit the map are served from S3; requests that miss fall through to `render-cache-plain.percy.zone:443`, which holds the DOM HTML itself. The result is a byte-for-byte replay of what the engine rendered at scan time.

## When to use

Use path B when any of the following is true:

- The customer URL is behind auth / geo-block / VPN you can't satisfy.
- The URL has been removed, or the page has materially changed since the scan.
- You suspect scan-time DOM drift (the live script shows `decision: true` / pass, but the engine saw the element in a different state).
- You want a deterministic repro that other engineers can reproduce from the same `proxy_map.json`.

Otherwise stay on path A (live URL via Claude-in-Chrome).

## Prereqs

- macOS on arm64 (Apple Silicon). The shipped jackproxy binary is `jackproxy-darwin-arm64`; there is no linux/x86 build at present. If on unsupported platform, stop and tell the user.
- `mini-percy-renderer/` present at the repo root (it is, in the monorepo layout).
- The user has the `proxy_map.json` for the scan run to investigate. Ask them for it explicitly; do not guess or reuse an unrelated map.
- The jackproxy MITM certs (`mini-percy-renderer/data/server.key`, `server.pem`). These ship in the repo.

## Flow

### Step 1 &mdash; stage the proxy map

Ask the user to drop their `proxy_map.json` at `mini-percy-renderer/proxy_map.json`. Don't overwrite it with a placeholder; if one is already there from a previous investigation, check with the user before replacing.

**Never read `proxy_map.json` in full.** It's an origin&rarr;S3 URL map &mdash; typically hundreds to low-thousands of entries, each a long signed CloudFront URL. Reading it whole can easily burn 10&ndash;50k tokens for zero FP-analysis value; the file's *content* is irrelevant to the rule being debugged. If inspection is needed (verifying the map covers the target host, sanity-checking asset freshness), use `Read` with `limit: 20` or `Grep` for a specific origin. Rely on jackproxy's startup log (which prints resolved proxymap-domains on one line) as the primary sanity check that the map parsed and covers the target host.

### Step 2 &mdash; start jackproxy (background)

```bash
cd mini-percy-renderer && npm run jackproxy
```

Runs `./jackproxy-darwin-arm64 --port 8080 --proxy-map proxy_map.json --upstream-host render-cache-plain.percy.zone:443 --log-level=debug`. Probe with `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/` &mdash; expect `404` (proxy alive, no default route). Tail the log if requests don't resolve.

### Step 3 &mdash; launch Chrome against the proxy

Run the skill's launcher:

```bash
node .claude/skills/stack:debug-fp/scripts/launch-proxy-chrome.js <url>
```

The launcher uses `mini-percy-renderer/node_modules/chrome-launcher` to spawn Chrome with `--proxy-server=localhost:8080 --ignore-certificate-errors --remote-debugging-port=9222`, opens `<url>`, and blocks until killed. It does **not** call `Emulation.setScriptExecutionDisabled` &mdash; page JS hydrates normally, which is what you want for most FP investigations.

If you need the pristine snapshot (a rule whose judgement happens pre-hydration), add `Emulation.setScriptExecutionDisabled({value: true})` via a CDP call after the launcher comes up. `Runtime.evaluate` is unaffected either way, so axe injection + port execution still work.

### Step 4 &mdash; drive via run-with-axe

Claude-in-Chrome cannot target this Chrome &mdash; it connects to the user's existing browser. Use the skill's CDP runner, which injects axe, calls `axe.setup()`, runs the port, and handles teardown:

```bash
node .claude/skills/stack:debug-fp/scripts/run-with-axe.js /tmp/debug-fp-<rule-id>.js --match=<url-substring>
```

Always connect on `127.0.0.1:9222` (the runner does this). Never `localhost:9222` &mdash; it resolves to `::1` on Node and Chrome binds to IPv4.

### Step 5 &mdash; tear down

**Before killing anything, ask the user whether the session should stay up.** jackproxy + the throwaway Chrome can be reused for another selector, another rule, or a paper-verification probe on the same page &mdash; axe is already injected and the proxyMap is already mounted, so the next run is near-instant and costs far fewer tokens than a fresh setup. Prompt explicitly:

> "Chrome (`:9222`) + jackproxy (`:8080`) are still live on `<url>`. Run another selector, another rule, or tear down?"

Only run the kill commands after the user confirms they're done:

```bash
kill $(lsof -ti:9222)   # chrome-launcher Chrome
kill $(lsof -ti:8080)   # jackproxy
```

**Expected exit codes after `kill`:** both processes exit with **143** (128 + SIGTERM 15). If you launched `jackproxy` via `Bash(run_in_background: true)`, the completion notification will read *"failed with exit code 143"* &mdash; that is the normal shutdown, **not** a failure. Only treat exits as errors if the code is something else (e.g. 1 = jackproxy startup error, 2 = launcher bad args), or if the process died *before* you issued the `kill`.

When starting `jackproxy` and `launch-proxy-chrome.js` as background tasks, give each a descriptive `description` (e.g. `"jackproxy :8080"`, `"proxy-chrome :9222"`) so the expected 143 notification at teardown is traceable to the right process.

Leave `mini-percy-renderer/proxy_map.json` in place if the user may re-run; otherwise check with them before clearing.

## What works / what doesn't

| Capability | Path A (live) | Path B (proxyMap) |
|---|---|---|
| Axe injection + `Runtime.evaluate` port | ✓ | ✓ |
| B1/B2 rule ports | ✓ | ✓ |
| Type C nodeData reconstruction | ✓ | ✓ (closer to scan-time input) |
| Manual steps (click dropdowns, dismiss banners) | ✓ (user does it in Claude-in-Chrome) | ✗ if page JS is disabled; partial if enabled (events may reference missing origins) |
| Auth-gated pages | user logs in | ✓ (snapshot already captured it) |
| Geo-blocked pages | ✗ | ✓ |
| Removed / deleted pages | ✗ | ✓ |
| Scan-time drift repro | ✗ (shows live state) | ✓ (exact snapshot) |
| Non-darwin-arm64 hosts | ✓ | ✗ (no binary) |

## Caveats

- **The MITM cert is a real trust surface.** The `--ignore-certificate-errors` flag disables TLS verification for the spawned Chrome only. Do not run normal browsing on the throwaway profile &mdash; same rule as the existing CDP fallback.
- **The proxy map is scan-tied.** If the user gives you a `proxy_map.json` from a different scan run, the snapshot URL the page fetches from `render-cache-plain.percy.zone` will resolve to a different DOM than the one the user's violation was reported against. Always confirm the map matches the scan-id under investigation.
- **Snapshot URLs expire.** S3 objects in `browserstack-a11y-engine-*` buckets have TTLs. If the scan is older than the asset retention window (check with the a11y team), the map will reference objects that return 404; jackproxy will log the misses and Chrome will render a broken page.
- **No interactive CAPTCHA / auth flow.** By definition, nothing beyond what the scan captured is reachable. Reshoots require a new scan, not this fallback.

## Decision: path A or path B?

Default to path A. Switch to path B only when path A is demonstrably blocked and the user has a `proxy_map.json` ready. Never silently fall through &mdash; ask.
