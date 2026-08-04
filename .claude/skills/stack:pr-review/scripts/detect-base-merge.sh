#!/usr/bin/env bash
# detect-base-merge.sh — decide whether a PR's head is a pure "merge base branch
# into PR branch" commit whose Claude Code Review verdict can be inherited from the
# first parent, and act on it. Self-contained: does its own gh lookups from args, so
# it never depends on shell state persisting across the skill's separate tool calls.
#
# Behavior:
#   - Detects a base-merge head (2 parents; 2nd parent fully contained in <base_ref>).
#   - Reads the first parent's latest terminal `Claude Code Review` status across ALL
#     pages of statuses.
#   - Inherits the parent's verdict: success -> post success; failure -> post failure.
#   - A genuinely unreviewed parent (no status) or a failed status read -> no post.
#   - Never posts a PR comment or an inline review.
#
# Usage:
#   detect-base-merge.sh <owner/repo> <pr-number>
#
# Output (stdout, last line): FAST_PATH_RESULT=success | failure | none
# Exit codes: 0 for any decided case; 2 for bad args.
set -uo pipefail

STATUS_CONTEXT="Claude Code Review"

result() { printf 'FAST_PATH_RESULT=%s\n' "$1"; exit 0; }

if [ "$#" -ne 2 ]; then
  echo "usage: detect-base-merge.sh <owner/repo> <pr-number>" >&2
  exit 2
fi
OWNER_REPO="$1"
PR_NUMBER="$2"

# 1) Resolve head SHA + base ref for the PR.
PR_JSON=$(gh pr view "$PR_NUMBER" --repo "$OWNER_REPO" --json headRefOid,baseRefName 2>/dev/null) \
  || { echo "gh pr view failed for $OWNER_REPO#$PR_NUMBER" >&2; result none; }
HEAD_SHA=$(printf '%s' "$PR_JSON" | jq -r '.headRefOid // ""')
BASE_REF=$(printf '%s' "$PR_JSON" | jq -r '.baseRefName // ""')
[ -n "$HEAD_SHA" ] && [ -n "$BASE_REF" ] || { echo "could not resolve head/base" >&2; result none; }

# 2) Parents of the head commit.
COMMIT_JSON=$(gh api "repos/$OWNER_REPO/commits/$HEAD_SHA" 2>/dev/null) \
  || { echo "gh api commits failed" >&2; result none; }
PARENTS=$(printf '%s' "$COMMIT_JSON" | jq -r '[.parents[].sha] | join(" ")')
PARENT_COUNT=$(printf '%s\n' "$PARENTS" | wc -w | tr -d ' ')
[ "$PARENT_COUNT" = "2" ] || { echo "head is not a 2-parent merge (parents: $PARENT_COUNT)" >&2; result none; }
P1=${PARENTS%% *}   # first parent: PR-branch tip before the merge
P2=${PARENTS#* }    # second parent: the branch merged in

# 3) Is P2 fully contained in the base branch? (behind|identical == yes)
CMP_JSON=$(gh api "repos/$OWNER_REPO/compare/$BASE_REF...$P2" 2>/dev/null) \
  || { echo "gh api compare failed" >&2; result none; }
CMP_STATUS=$(printf '%s' "$CMP_JSON" | jq -r '.status // ""')
case "$CMP_STATUS" in
  behind|identical) : ;;  # pure base-merge — proceed
  *) echo "2nd parent not contained in '$BASE_REF' (compare status: '$CMP_STATUS')" >&2; result none ;;
esac

# 4) Latest terminal Claude Code Review status on P1, across ALL pages.
#    Pipe raw slurped JSON through our own jq so pagination selection is exercised.
if STATUSES_JSON=$(gh api "repos/$OWNER_REPO/commits/$P1/statuses" --paginate --slurp 2>/dev/null); then
  PARENT_STATE=$(printf '%s' "$STATUSES_JSON" \
    | jq -r --arg ctx "$STATUS_CONTEXT" '[.[][] | select(.context == $ctx)] | .[0].state // ""')
else
  echo "parent status read failed (transient) — running full review to be safe" >&2
  result none
fi

# 5) Inherit the parent's verdict.
case "$PARENT_STATE" in
  success)
    gh api "repos/$OWNER_REPO/statuses/$HEAD_SHA" \
      -f state=success -f context="$STATUS_CONTEXT" \
      -f description="Skipped: merge from $BASE_REF (parent reviewed)" >/dev/null 2>&1 \
      || { echo "failed to post inherited success status" >&2; result none; }
    result success
    ;;
  failure)
    gh api "repos/$OWNER_REPO/statuses/$HEAD_SHA" \
      -f state=failure -f context="$STATUS_CONTEXT" \
      -f description="Failed: inherited from reviewed parent (merge from $BASE_REF)" >/dev/null 2>&1 \
      || { echo "failed to post inherited failure status" >&2; result none; }
    result failure
    ;;
  *)
    echo "parent $P1 has no Claude Code Review status — running full review" >&2
    result none
    ;;
esac
