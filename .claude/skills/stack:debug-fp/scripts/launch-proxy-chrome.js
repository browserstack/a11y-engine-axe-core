#!/usr/bin/env node
/**
 * launch-proxy-chrome.js — Path B launcher.
 *
 * Spawns a Chrome instance via mini-percy-renderer's chrome-launcher,
 * pointed at jackproxy (localhost:8080) with TLS verification disabled and
 * remote-debugging exposed on port 9222. Leaves Chrome running until SIGTERM.
 *
 * Usage:
 *   node launch-proxy-chrome.js <url>
 *
 * Prereqs:
 *   - darwin-arm64 (jackproxy binary limitation)
 *   - jackproxy already running on localhost:8080 with the right proxy_map
 *   - mini-percy-renderer/node_modules present (chrome-launcher resolves from there)
 *
 * Exit codes: 0 = Chrome running, 2 = bad args, 3 = mini-percy-renderer missing.
 */

const fs = require('fs');
const path = require('path');

const url = process.argv[2];
if (!url) {
  process.stderr.write('usage: launch-proxy-chrome.js <url> [proxy-port]\n');
  process.exit(2);
}
const proxyPort = process.argv[3] || '8080';

// Resolve mini-percy-renderer relative to the repo root (two levels up from .claude/skills/stack:debug-fp/scripts/)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MPR_DIR = path.join(REPO_ROOT, 'mini-percy-renderer');
const CHROME_LAUNCHER = path.join(MPR_DIR, 'node_modules', 'chrome-launcher', 'dist', 'index.js');

if (!fs.existsSync(CHROME_LAUNCHER)) {
  process.stderr.write(
    `[launch-proxy-chrome] chrome-launcher not found at ${CHROME_LAUNCHER}\n` +
    `  run: (cd ${MPR_DIR} && npm install)\n`
  );
  process.exit(3);
}

process.chdir(MPR_DIR);

(async () => {
  const { launch } = await import(CHROME_LAUNCHER);
  const chrome = await launch({
    startingUrl: url,
    port: 9222,
    chromeFlags: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--safebrowsing-disable-auto-update',
      `--proxy-server=localhost:${proxyPort}`,
    ],
  });
  process.stderr.write(`[launch-proxy-chrome] pid=${chrome.pid} port=${chrome.port}\n`);

  const shutdown = async () => {
    try { await chrome.kill(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {}); // block forever
})().catch((e) => {
  process.stderr.write('[launch-proxy-chrome] fatal: ' + (e.stack || e.message) + '\n');
  process.exit(1);
});
