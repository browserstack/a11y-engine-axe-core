#!/usr/bin/env bash
# post-review-status.sh — record the Claude Code Review outcome on a PR.
#
# Reads the verdict from the review report and records the outcome on the PR in
# up to three ways, in this order:
#   1. Commit status  — the `Claude Code Review` status (success/failure) via
#      GitHub's Commit Status API. This is the gating signal; it is posted FIRST
#      so the review/comment never land without a corresponding status.
#   2. Inline review  — when a findings JSON is supplied, ONE pull-request review
#      carrying the anchorable findings as inline `comments[]`, submitted with
#      `event=COMMENT`. It is COMMENT-only — never APPROVE/REQUEST_CHANGES — so it
#      cannot trip the "Can not approve your own pull request" (422) failure that
#      GitHub raises for those events on self-authored PRs. Non-fatal: a failure
#      here is reported but does not stop the full report comment from posting.
#   3. PR comment     — the full markdown report via `gh pr comment`. This is the
#      canonical human-readable record and the home for non-anchorable findings.
#
# Usage:
#   post-review-status.sh <REPORT_FILE> <OWNER_REPO> <HEAD_SHA> <PR_NUMBER> [FINDINGS_JSON]
#
# FINDINGS_JSON (optional): path to a JSON file holding an array of reviews-API
# comment objects, each: {path, line, side, [start_line, start_side,] body}.
# Only anchorable findings (line is part of the PR diff) belong here. An empty
# array (or an omitted arg) skips the inline review entirely.
#
# Exit codes:
#   0  status posted (inline review + comment attempted; their failures are warned, not fatal)
#   1  bad args, missing/malformed verdict, missing findings file, or the commit-status write failed
set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 5 ]; then
  echo "usage: post-review-status.sh <REPORT_FILE> <OWNER_REPO> <HEAD_SHA> <PR_NUMBER> [FINDINGS_JSON]" >&2
  exit 1
fi

REPORT_FILE="$1"
OWNER_REPO="$2"
HEAD_SHA="$3"
PR_NUMBER="$4"
FINDINGS_JSON="${5:-}"
STATUS_CONTEXT="Claude Code Review"

if [ ! -f "$REPORT_FILE" ]; then
  echo "Report file not found: $REPORT_FILE" >&2
  exit 1
fi

# Extract the verdict word from the last `**Verdict: <word>**` line in the report.
# Tolerant of case, surrounding whitespace, and trailing prose after the closing `**`.
VERDICT_LINE=$(grep -iE '\*\*[[:space:]]*Verdict:[[:space:]]*[A-Za-z]' "$REPORT_FILE" | tail -n1)
VERDICT_WORD=$(printf '%s\n' "$VERDICT_LINE" \
  | sed -E 's/.*[Vv]erdict:[[:space:]]*//' \
  | sed -E 's/[[:space:]]*\*\*.*//' \
  | tr '[:upper:]' '[:lower:]' \
  | tr -d '[:space:]')

case "$VERDICT_WORD" in
  pass|passed|approve|approved|ok|lgtm|good|success)
    STATE=success
    DESCRIPTION="Passed"
    ;;
  fail|failed|reject|rejected|block|blocked|needs-work|needswork|changes-requested|changesrequested)
    STATE=failure
    DESCRIPTION="Failed - see PR comment"
    ;;
  "")
    echo "Report did not contain a Verdict line" >&2; exit 1
    ;;
  *)
    echo "Verdict word '$VERDICT_WORD' not in accepted pass/fail vocabulary" >&2; exit 1
    ;;
esac

# 1. Commit status — the gating signal, posted first.
gh api "repos/$OWNER_REPO/statuses/$HEAD_SHA" \
  -f state="$STATE" \
  -f context="$STATUS_CONTEXT" \
  -f description="$DESCRIPTION" \
  || { echo "Failed to post commit status. Review and comment not posted." >&2; exit 1; }

# 2. Inline review — one COMMENT review carrying the anchorable findings.
#    Non-fatal: any failure here is warned but does not block the report comment.
if [ -n "$FINDINGS_JSON" ]; then
  if [ ! -f "$FINDINGS_JSON" ]; then
    echo "Findings JSON not found: $FINDINGS_JSON — skipping inline review." >&2
  elif ! command -v jq >/dev/null 2>&1; then
    echo "jq not available — skipping inline review (commit status and comment still post)." >&2
  elif ! jq -e 'type == "array"' "$FINDINGS_JSON" >/dev/null 2>&1; then
    echo "Findings JSON is not a JSON array — skipping inline review." >&2
  else
    COMMENT_COUNT=$(jq 'length' "$FINDINGS_JSON")
    if [ "$COMMENT_COUNT" = "0" ]; then
      echo "No anchorable findings — skipping inline review (full report still posted as a comment)."
    else
      REVIEW_BODY="Claude Code Review (automated) — ${COMMENT_COUNT} inline finding(s). Full report in the PR comment below. Verdict: ${DESCRIPTION}."
      REVIEW_PAYLOAD=$(mktemp -t claude-code-pr-review-payload.XXXXXX.json)
      jq -n \
        --arg sha "$HEAD_SHA" \
        --arg body "$REVIEW_BODY" \
        --slurpfile comments "$FINDINGS_JSON" \
        '{commit_id: $sha, event: "COMMENT", body: $body, comments: $comments[0]}' \
        > "$REVIEW_PAYLOAD"

      if REVIEW_URL=$(gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews" \
            --method POST --input "$REVIEW_PAYLOAD" --jq '.html_url' 2>&1); then
        echo "Inline review posted: $REVIEW_URL"
      else
        echo "Failed to post inline review (continuing to full report comment):" >&2
        echo "  $REVIEW_URL" >&2
        echo "  Hint: GitHub rejects the whole review (422) if any comment line is not part of the diff." >&2
      fi
      rm -f "$REVIEW_PAYLOAD"
    fi
  fi
fi

# 3. PR comment — the full report; canonical record and home for non-anchorable findings.
COMMENT_URL=$(gh pr comment "$PR_NUMBER" --repo "$OWNER_REPO" --body-file "$REPORT_FILE") \
  || { echo "Status posted but failed to post PR comment." >&2; exit 1; }

echo "Comment posted: $COMMENT_URL"
echo "Verdict: $STATE"
