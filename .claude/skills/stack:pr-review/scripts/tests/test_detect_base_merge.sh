#!/usr/bin/env bash
# Tests for detect-base-merge.sh. No network: `gh` is stubbed on PATH; real jq is used.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
SCRIPT="$SCRIPTS/detect-base-merge.sh"
FAILURES=0

command -v jq >/dev/null 2>&1 || { echo "jq required for tests"; exit 1; }

# The skill dir name contains a colon (stack:pr-review) — the PATH separator — so the
# real stubs dir cannot go on PATH (it would split into two broken entries and the real
# gh would run). Copy the stub into a colon-free temp dir and use that on PATH.
STUBSRC="$HERE/stubs/gh"
STUBDIR="$(mktemp -d)"
# run() sets GOT and LAST_POST in THIS shell. Call it directly (never via $(run)) so
# the assignments survive — the POST log is a real file, so the stub's writes persist.
POST_LOG="$(mktemp)"
trap 'rm -rf "$STUBDIR"; rm -f "$POST_LOG"' EXIT
cp "$STUBSRC" "$STUBDIR/gh"; chmod +x "$STUBDIR/gh"
run() {
  : > "$POST_LOG"
  GOT="$(FAKE_POST_LOG="$POST_LOG" PATH="$STUBDIR:$PATH" \
    bash "$SCRIPT" "acme/repo" "42" 2>/dev/null | grep '^FAST_PATH_RESULT=' | tail -n1)"
  LAST_POST="$(cat "$POST_LOG")"
}

expect() { # <label> <expected-marker>
  local label="$1" want="$2"
  if [ "$GOT" = "FAST_PATH_RESULT=$want" ]; then
    echo "ok: $label"
  else
    echo "FAIL: $label — got '$GOT', want 'FAST_PATH_RESULT=$want'"; FAILURES=$((FAILURES+1))
  fi
}

# 1) Green parent + pure base-merge (compare 'behind') -> success + success POST.
export FAKE_HEAD_SHA=merge1 FAKE_BASE_REF=main
export FAKE_PARENTS_JSON='{"parents":[{"sha":"p1"},{"sha":"p2"}]}'
export FAKE_COMPARE_JSON='{"status":"behind"}'
export FAKE_STATUSES_JSON='[[{"context":"other","state":"success"},{"context":"Claude Code Review","state":"success"}]]'
unset FAKE_STATUSES_FAIL
run; expect "green parent -> success" "success"
printf '%s' "$LAST_POST" | grep -q 'state=success' || { echo "FAIL: green parent should POST state=success (got: $LAST_POST)"; FAILURES=$((FAILURES+1)); }

# 2) Red parent + pure base-merge (compare 'identical') -> failure + failure POST.
export FAKE_COMPARE_JSON='{"status":"identical"}'
export FAKE_STATUSES_JSON='[[{"context":"Claude Code Review","state":"failure"}]]'
run; expect "red parent -> failure" "failure"
printf '%s' "$LAST_POST" | grep -q 'state=failure' || { echo "FAIL: red parent should POST state=failure (got: $LAST_POST)"; FAILURES=$((FAILURES+1)); }

# 3) Parent has NO Claude Code Review status -> none, no POST (safety invariant).
export FAKE_STATUSES_JSON='[[{"context":"other","state":"success"}]]'
run; expect "unreviewed parent -> none" "none"
[ -z "$LAST_POST" ] || { echo "FAIL: unreviewed parent must not POST (got: $LAST_POST)"; FAILURES=$((FAILURES+1)); }

# 4) Parent-status read fails (transient) -> none, no POST (not mistaken for unreviewed-vs-crash).
export FAKE_STATUSES_JSON='[[{"context":"Claude Code Review","state":"success"}]]'
export FAKE_STATUSES_FAIL=1
run; expect "status read error -> none" "none"
unset FAKE_STATUSES_FAIL
[ -z "$LAST_POST" ] || { echo "FAIL: read error must not POST (got: $LAST_POST)"; FAILURES=$((FAILURES+1)); }

# 5) Paginated: Claude status only on the SECOND page -> still found (validates --slurp/.[][]).
export FAKE_COMPARE_JSON='{"status":"behind"}'
export FAKE_STATUSES_JSON='[[{"context":"a","state":"error"}],[{"context":"Claude Code Review","state":"success"}]]'
run; expect "paginated status found -> success" "success"

# 6) Not a merge commit (1 parent) -> none.
export FAKE_PARENTS_JSON='{"parents":[{"sha":"p1"}]}'
export FAKE_STATUSES_JSON='[[{"context":"Claude Code Review","state":"success"}]]'
run; expect "single-parent -> none" "none"

# 7) Merge whose 2nd parent is NOT contained in base (compare 'diverged') -> none.
export FAKE_PARENTS_JSON='{"parents":[{"sha":"p1"},{"sha":"p2"}]}'
export FAKE_COMPARE_JSON='{"status":"diverged"}'
run; expect "diverged 2nd parent -> none" "none"

# 8) Bad args -> exit 2.
if PATH="$STUBDIR:$PATH" bash "$SCRIPT" "onlyonearg" >/dev/null 2>&1; then
  echo "FAIL: bad args should exit non-zero"; FAILURES=$((FAILURES+1))
else
  echo "ok: bad args exit non-zero"
fi

if [ "$FAILURES" -eq 0 ]; then echo "ALL PASS"; exit 0; fi
echo "$FAILURES failure(s)"; exit 1
