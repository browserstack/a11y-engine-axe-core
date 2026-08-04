#!/usr/bin/env bash
# Contract checks on SKILL.md's fast-path wiring.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$(cd "$HERE/../.." && pwd)/SKILL.md"
FAILURES=0
must()    { grep -q "$1" "$SKILL" || { echo "FAIL: SKILL.md missing: $1"; FAILURES=$((FAILURES+1)); }; }
mustnot() { grep -q "$1" "$SKILL" && { echo "FAIL: SKILL.md still contains: $1"; FAILURES=$((FAILURES+1)); }; return 0; }

must 'detect-base-merge.sh'
must 'FAST_PATH_RESULT'
# The old inline detection must be gone (these strings were unique to it).
mustnot 'IS_BASE_MERGE'
mustnot 'PARENT_REVIEW_STATE'

if [ "$FAILURES" -eq 0 ]; then echo "SKILL.md fast-path contract OK"; exit 0; fi
echo "$FAILURES failure(s)"; exit 1
