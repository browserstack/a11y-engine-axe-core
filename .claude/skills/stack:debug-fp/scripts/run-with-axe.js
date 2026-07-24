#!/usr/bin/env node
/**
 * run-with-axe.js — inject axe, call axe.setup(), evaluate a port IIFE, axe.teardown().
 *
 * The canonical debug-fp runner. Connects to Chrome on 127.0.0.1:9222 (use 127.0.0.1,
 * NOT localhost — IPv6 breaks it), picks a page target, injects a11y-engine-core's
 * forked axe bundle, calls axe.setup(document), evaluates the rule port, prints JSON.
 *
 * Usage:
 *   node run-with-axe.js <port-script.js>                           # first page tab
 *   node run-with-axe.js <port-script.js> --match=<substr>          # first tab whose URL contains <substr>
 *   node run-with-axe.js <port-script.js> --wait=2000               # delay after axe.setup() before port runs
 *   node run-with-axe.js <port-script.js> --no-setup                # skip axe.setup() (port calls it itself)
 *
 * The port script must be an IIFE that returns a JSON-serialisable value.
 * axe is available at window.axe when the port runs. Port is responsible for axe.teardown().
 *
 * Output: single JSON blob on stdout. Diagnostics on stderr.
 * Exit codes: 0 = success, 2 = bad args, 3 = no Chrome on 9222, 4 = eval threw,
 *             5 = no matching tab, 6 = axe bundle missing.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

// ---------- deps: auto-install ws into scripts/node_modules ----------------
function loadWS() {
  try { return require('ws'); } catch (_) { /* not installed */ }
  process.stderr.write('[run-with-axe] first-run: installing ws into scripts/ ...\n');
  try {
    execSync('npm install ws@8 --no-audit --no-fund --silent', {
      cwd: __dirname,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (_) {
    process.stderr.write('[run-with-axe] failed to install ws. Run: (cd ' + __dirname + ' && npm install ws@8)\n');
    process.exit(1);
  }
  return require('ws');
}
const WebSocket = loadWS();

// ---------- args ----------------------------------------------------------
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  process.stderr.write('usage: run-with-axe.js <port-script.js> [--match=<substr>] [--wait=<ms>] [--no-setup]\n');
  process.exit(2);
}
const scriptPath = args[0];
const opts = Object.fromEntries(
  args.slice(1).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  })
);
if (!fs.existsSync(scriptPath)) {
  process.stderr.write(`[run-with-axe] port script not found: ${scriptPath}\n`);
  process.exit(2);
}

// ---------- axe bundle path -----------------------------------------------
// scripts/ → debug-fp/ → skills/ → .claude/ → repo root → a11y-engine-core/dist/axe.min.js
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const AXE_PATH = path.join(REPO_ROOT, 'a11y-engine-core', 'dist', 'axe.min.js');
if (!fs.existsSync(AXE_PATH)) {
  process.stderr.write(`[run-with-axe] axe bundle missing: ${AXE_PATH}\n  run: (cd ${path.join(REPO_ROOT, 'a11y-engine-core')} && ./build/scripts/build_axe.sh && npm run build)\n`);
  process.exit(6);
}

// ---------- HTTP helper ---------------------------------------------------
function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// ---------- CDP session ---------------------------------------------------
async function openSession() {
  let tabs;
  try { tabs = await httpJson('http://127.0.0.1:9222/json'); }
  catch (_) {
    process.stderr.write('[run-with-axe] no Chrome on 127.0.0.1:9222. Start it with scripts/launch-proxy-chrome.js or open-chrome.sh.\n');
    process.exit(3);
  }
  const pages = tabs.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (pages.length === 0) {
    process.stderr.write('[run-with-axe] no page targets.\n');
    process.exit(3);
  }
  const target = opts.match
    ? pages.find((t) => (t.url || '').includes(opts.match))
    : pages[0];
  if (!target) {
    process.stderr.write(`[run-with-axe] no tab matches --match="${opts.match}". Tabs:\n` +
      pages.map((t) => '  - ' + t.url).join('\n') + '\n');
    process.exit(5);
  }
  process.stderr.write(`[run-with-axe] target: ${target.url}\n`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 200 * 1024 * 1024 });
    let id = 0;
    const pending = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r, reject: j } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) j(new Error(msg.error.message));
        else r(msg.result);
      }
    });
    ws.on('open', () => resolve({
      send: (method, params = {}) => {
        const mid = ++id;
        return new Promise((r, j) => {
          pending.set(mid, { resolve: r, reject: j });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    }));
    ws.on('error', reject);
  });
}

async function evalJs(session, expression, label) {
  const res = await session.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: false, userGesture: false,
  });
  if (res.exceptionDetails) {
    throw new Error(`${label || 'eval'} threw: ` + JSON.stringify(res.exceptionDetails).slice(0, 800));
  }
  return res.result && res.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- main ---------------------------------------------------------
(async () => {
  const axeSrc = fs.readFileSync(AXE_PATH, 'utf8');
  const portSrc = fs.readFileSync(scriptPath, 'utf8');
  const session = await openSession();

  // 1. Inject axe
  const injectExpr = `
    (() => {
      if (window.axe) return { injected: false, reason: 'already present', version: axe.version };
      try {
        ${axeSrc}
        return { injected: true, version: (window.axe && axe.version) || 'unknown' };
      } catch (e) {
        return { injected: false, error: String(e && e.message || e) };
      }
    })()
  `;
  const injectRes = await evalJs(session, injectExpr, 'injection');
  process.stderr.write('[run-with-axe] axe: ' + JSON.stringify(injectRes) + '\n');
  if (!injectRes.injected && !injectRes.reason) {
    session.close();
    process.stderr.write('[run-with-axe] axe injection failed.\n');
    process.exit(4);
  }

  // 2. axe.setup() (unless the port will do it itself)
  if (!opts['no-setup']) {
    try {
      await evalJs(session, '(() => { axe.setup(document); return true; })()', 'setup');
    } catch (e) {
      session.close();
      process.stderr.write('[run-with-axe] axe.setup() threw: ' + e.message + '\n');
      process.exit(4);
    }
  }

  if (opts.wait) await sleep(Number(opts.wait));

  // 3. Run the port. Port is responsible for axe.teardown() in its finally block.
  let portRes;
  try {
    portRes = await evalJs(session, portSrc, 'port');
  } catch (e) {
    // best-effort teardown
    try { await evalJs(session, '(() => { try { axe.teardown(); } catch (_) {} return true; })()', 'teardown'); } catch (_) {}
    session.close();
    process.stderr.write('[run-with-axe] port error: ' + e.message + '\n');
    process.exit(4);
  }

  session.close();
  console.log(JSON.stringify(portRes, null, 2));
})().catch((e) => {
  process.stderr.write('[run-with-axe] fatal: ' + (e.stack || e.message) + '\n');
  process.exit(1);
});
