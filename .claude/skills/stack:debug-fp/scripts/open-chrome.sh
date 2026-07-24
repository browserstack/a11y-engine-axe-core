#!/usr/bin/env bash
# open-chrome.sh — launch Chrome with CDP debug port on 9222, using a throwaway profile.
# Usage: open-chrome.sh <url>            # launch (or reuse) and navigate
#        open-chrome.sh --stop           # kill the debug Chrome
#        open-chrome.sh --status         # print "running" or "not running"

set -euo pipefail

PORT=9222
PROFILE_DIR=/tmp/chrome-debug-fp
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

cdp_up() { curl -sf "http://localhost:${PORT}/json/version" >/dev/null 2>&1; }

case "${1:-}" in
  --stop)
    pkill -f "chrome-debug-fp" || true
    echo "stopped"
    exit 0
    ;;
  --status)
    if cdp_up; then echo "running"; else echo "not running"; fi
    exit 0
    ;;
  "")
    echo "usage: $0 <url> | --stop | --status" >&2
    exit 2
    ;;
esac

URL="$1"

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "ERROR: Chrome not found at $CHROME_BIN" >&2
  exit 1
fi

if cdp_up; then
  echo "reusing existing debug Chrome on port ${PORT}"
  # Navigate via the runner's Page.navigate — just print the target to make it discoverable.
  TAB_URL=$(curl -s "http://localhost:${PORT}/json" | python3 -c 'import json,sys; tabs=[t for t in json.load(sys.stdin) if t.get("type")=="page"]; print(tabs[0]["webSocketDebuggerUrl"] if tabs else "")')
  echo "target: ${TAB_URL}"
  echo "To navigate, use: node $(dirname "$0")/cdp-run.js --url=\"${URL}\" /path/to/script.js"
  exit 0
fi

mkdir -p "$PROFILE_DIR"

# nohup + background so this script returns; Chrome stays up until --stop.
nohup "$CHROME_BIN" \
  --remote-debugging-port=${PORT} \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=ChromeWhatsNewUI \
  "$URL" \
  >/tmp/chrome-debug-fp.log 2>&1 &

# Wait for CDP endpoint.
for i in $(seq 1 40); do
  if cdp_up; then
    echo "chrome up on port ${PORT} (profile: ${PROFILE_DIR})"
    TAB_URL=$(curl -s "http://localhost:${PORT}/json" | python3 -c 'import json,sys; tabs=[t for t in json.load(sys.stdin) if t.get("type")=="page"]; print(tabs[0]["webSocketDebuggerUrl"] if tabs else "")')
    echo "target: ${TAB_URL}"
    exit 0
  fi
  sleep 0.25
done

echo "ERROR: Chrome did not expose port ${PORT} within 10s. See /tmp/chrome-debug-fp.log" >&2
exit 1
