#!/usr/bin/env bash
# gather-review-threads.sh — fetch a PR's review-thread resolution state (read-only).
#
# Prints the PR's reviewThreads nodes as a JSON array on stdout. This is the ONLY
# GraphQL the stack:pr-review skill needs. Keeping it in this script — instead of a
# `gh api graphql` entry in the skill's allowed-tools — means the skill grants no
# general GraphQL permission at all: the only GraphQL that can run is the fixed,
# read-only query below. There is no inline-query surface to smuggle a mutation through.
#
# Usage:
#   gather-review-threads.sh <owner> <repo> <pr-number>
#
# Output:
#   stdout — a JSON array of review-thread nodes ({isResolved, isOutdated, comments}),
#            or nothing if the query could not run.
#
# Exit codes:
#   0  query ran (array printed) OR the query failed (nothing printed) — the caller
#      treats empty output as "no thread-resolution signal" and degrades to REST-only.
#   2  bad arguments.
set -u

OWNER="${1:-}"
REPO="${2:-}"
PR="${3:-}"

if [ -z "$OWNER" ] || [ -z "$REPO" ] || [ -z "$PR" ]; then
  echo "usage: gather-review-threads.sh <owner> <repo> <pr-number>" >&2
  exit 2
fi

# The query is a read-only `query{...}` — never a mutation. It lives here as a fixed
# literal; nothing external can alter it at runtime.
QUERY='query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          comments(first: 1) {
            nodes {
              path
              author { login }
            }
          }
        }
      }
    }
  }
}'

# On any failure (auth, permissions, network, GraphQL `errors`, repo not found) the
# call returns non-zero or a non-array body. We emit ONLY a valid JSON array; anything
# else prints nothing, so the caller cleanly degrades to REST-only reconciliation
# instead of receiving an error blob.
RESULT=$(gh api graphql -f query="$QUERY" \
  -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes' 2>/dev/null) || RESULT=""

if printf '%s' "$RESULT" | jq -e 'type == "array"' >/dev/null 2>&1; then
  printf '%s\n' "$RESULT"
fi
exit 0
