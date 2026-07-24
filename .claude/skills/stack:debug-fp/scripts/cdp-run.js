#!/usr/bin/env node
/**
 * cdp-run.js — evaluate a JS file inside the page loaded in the debug Chrome on localhost:9222.
 *
 * Usage:
 *   node cdp-run.js <script.js>                           # run against the first open tab
 *   node cdp-run.js <script.js> --url=https://foo.com     # navigate first, wait for load
 *   node cdp-run.js <script.js> --wait=2000               # extra delay after load
 *   node cdp-run.js <script.js> --target=front            # use the foremost tab
 *   node cdp-run.js <script.js> --match=<substring>       # use first tab whose URL contains <substring>
 *
 * The script must be an expression that evaluates to a JSON-serialisable value
 * (see references/script-conversion.md — wrap your logic in an IIFE).
 *
 * Output: single JSON blob on stdout. Diagnostics on stderr.
 * Exit codes: 0 = success, 2 = bad args, 3 = no debug Chrome, 4 = eval threw, 5 = serialise failed.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

// ---------- deps: auto-install `ws` the first time ------------------------
function loadWS() {
  try { return require('ws'); } catch (_) {}
  process.stderr.write('[cdp-run] first-run: installing ws ...\n');
  try {
    execSync('npm install ws@8 --no-audit --no-fund --silent', {
      cwd: __dirname,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (e) {
    process.stderr.write('[cdp-run] failed to install ws. Run manually: (cd ' + __dirname + ' && npm install ws@8)\n');
    process.exit(1);
  }
  return require('ws');
}
const WebSocket = loadWS();

// ---------- args ----------------------------------------------------------
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  process.stderr.write('usage: cdp-run.js <script.js> [--url=<url>] [--wait=<ms>] [--target=front] [--match=<substr>]\n');
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
  process.stderr.write(`[cdp-run] script not found: ${scriptPath}\n`);
  process.exit(2);
}
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

// ---------- HTTP helper --------------------------------------------------
function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`bad JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// ---------- pick a target tab --------------------------------------------
async function pickTarget() {
  let tabs;
  try { tabs = await httpJson('http://localhost:9222/json'); }
  catch (e) {
    process.stderr.write('[cdp-run] no Chrome on port 9222. Run scripts/open-chrome.sh <url> first.\n');
    process.exit(3);
  }
  const pages = tabs.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (pages.length === 0) {
    process.stderr.write('[cdp-run] no page targets.\n');
    process.exit(3);
  }
  if (opts.match) {
    const hit = pages.find((t) => (t.url || '').includes(opts.match));
    if (!hit) {
      process.stderr.write(`[cdp-run] no tab URL matches "${opts.match}". Tabs:\n` +
        pages.map((t) => '  - ' + t.url).join('\n') + '\n');
      process.exit(3);
    }
    return hit;
  }
  if (opts.target === 'front') return pages[0];   // Chrome lists front tab first on macOS
  return pages[0];
}

// ---------- CDP session wrapper ------------------------------------------
class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method && this.listeners.has(msg.method)) {
        this.listeners.get(msg.method).forEach((cb) => cb(msg.params));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }
  close() { this.ws.close(); }
}

function openSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 200 * 1024 * 1024 });
    ws.on('open', () => resolve(new Session(ws)));
    ws.on('error', reject);
  });
}

function waitForLoad(session) {
  return new Promise((resolve) => {
    session.on('Page.loadEventFired', () => resolve());
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- main ---------------------------------------------------------
(async () => {
  const target = await pickTarget();
  process.stderr.write(`[cdp-run] target: ${target.url}\n`);
  const session = await openSession(target.webSocketDebuggerUrl);

  await session.send('Page.enable');
  await session.send('Runtime.enable');

  if (opts.url) {
    const loaded = waitForLoad(session);
    await session.send('Page.navigate', { url: opts.url });
    await Promise.race([loaded, sleep(30000)]);
  }
  if (opts.wait) await sleep(Number(opts.wait));

  // Wrap: if the user's script is not already an expression, treat as statements inside a function.
  // Convention: script should be an IIFE returning JSON. If it evaluates to undefined, still capture.
  const expression = `
    (() => {
      try {
        const __result = (function(){ ${scriptSource} \n })();
        return Promise.resolve(__result).then((v) => ({ ok: true, value: v }));
      } catch (e) {
        return { ok: false, error: { name: e && e.name, message: e && e.message, stack: e && e.stack } };
      }
    })()
  `;

  let res;
  try {
    res = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      includeCommandLineAPI: false,
      userGesture: false,
    });
  } catch (e) {
    process.stderr.write(`[cdp-run] evaluate failed: ${e.message}\n`);
    session.close();
    process.exit(4);
  }

  session.close();

  if (res.exceptionDetails) {
    process.stderr.write('[cdp-run] page threw:\n');
    process.stderr.write(JSON.stringify(res.exceptionDetails, null, 2) + '\n');
    process.exit(4);
  }
  const wrapped = res.result && res.result.value;
  if (!wrapped) {
    process.stderr.write('[cdp-run] no return value (possibly DOM node — must return JSON-serialisable)\n');
    process.exit(5);
  }
  if (!wrapped.ok) {
    console.log(JSON.stringify({ ok: false, error: wrapped.error }, null, 2));
    process.exit(4);
  }
  console.log(JSON.stringify(wrapped.value, null, 2));
})().catch((e) => {
  process.stderr.write(`[cdp-run] fatal: ${e.stack || e.message}\n`);
  process.exit(1);
});
