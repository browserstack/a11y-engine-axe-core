---
name: stack:pr-review
description: "Orchestrated PR review that delegates to installed reviewers, aggregates findings, and posts a 'Claude Code Review' commit status plus a PR comment via gh. Use when reviewing pull requests, before merging, or when asked for code review — even without explicitly saying 'PR review.'"
allowed-tools: Read, Glob, Grep, Bash(gh auth status), Bash(gh repo view*), Bash(gh pr view*), Bash(gh pr diff*), Bash(gh pr comment*), Bash(gh api repos/*/pulls/*/files*), Bash(gh api repos/*/pulls/*/comments*), Bash(gh api repos/*/pulls/*/reviews*), Bash(gh api repos/*/issues/*/comments*), Bash(gh api repos/*/commits/*), Bash(gh api repos/*/compare/*), Bash(gh api repos/*/statuses/*), Bash(mktemp*), Bash(cat*), Agent, Skill
---

<!-- Version: 2026-07-06 | Source: @browserstack/ai-harness | Do not remove this header -->

# PR Review (Orchestrator)

You are running a 4-step orchestrated PR review. Do every step in order. Do not skip steps. If a step halts the run, stop and report the reason.

## Mode flag — `--collect-only`

If the first whitespace-separated token of `$ARGUMENTS` is `--collect-only`, run in **collect-only mode** (used by orchestrators such as `stack:workspace-pr-review` that merge additional findings into the report before posting):

- Strip the flag; the remainder of `$ARGUMENTS` (possibly empty) is the PR reference for Step 1.
- Skip the base-merge fast-path entirely — it posts a commit status, and collect-only must never post.
- Run Steps 1–3 exactly as normal.
- Do NOT run Step 4. End the run by reporting, as your final output, exactly these five values on separate lines, then stop:
  `REPORT_FILE=<path>`, `FINDINGS_FILE=<path>`, `OWNER_REPO=<owner/repo>`, `HEAD_SHA=<sha>`, `PR_NUMBER=<n>`.
- Never post anything to GitHub in this mode: no commit status, no review, no PR comment.

Without the flag, behavior is unchanged.

## Step 1 — Verify `gh` CLI and resolve PR context

Run the following as one continuous shell session — variables set in earlier lines are reused later:

```bash
# Step 1: assumes one continuous shell session.
gh auth status \
  || { echo "gh not authenticated - run 'gh auth login' and retry."; exit 1; }

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  || { echo "Not inside a GitHub repo recognised by gh - open a clone with a github remote."; exit 1; }

# PR_REF comes from $ARGUMENTS (PR number or URL) after stripping a leading
# --collect-only flag if present (see "Mode flag" above). If empty, gh resolves
# the PR for the current branch on its own — so we leave the positional argument off.
PR_REF="${ARGUMENTS:-}"
PR_REF="${PR_REF#--collect-only}"; PR_REF="${PR_REF# }"

# Resolve the PR number first (this is the only lookup that may use the current
# branch). Every command after this targets the PR by number against the API
# with an explicit --repo, so nothing downstream depends on local HEAD or the
# working tree — the review always reflects what was pushed to the PR.
# shellcheck disable=SC2086  # PR_REF is intentionally unquoted: empty -> omit arg.
PR_NUMBER=$(gh pr view $PR_REF --json number -q .number 2>/dev/null) \
  || { echo "No open PR found. Pass a PR number/URL as the argument or open a PR for the current branch first."; exit 1; }
PR_URL=$(gh pr view    "$PR_NUMBER" --repo "$OWNER_REPO" --json url          -q .url)
HEAD_SHA=$(gh pr view  "$PR_NUMBER" --repo "$OWNER_REPO" --json headRefOid   -q .headRefOid)
BASE_REF=$(gh pr view  "$PR_NUMBER" --repo "$OWNER_REPO" --json baseRefName  -q .baseRefName)
HEAD_REF=$(gh pr view  "$PR_NUMBER" --repo "$OWNER_REPO" --json headRefName  -q .headRefName)
HEAD_SHORT=$(printf "%s" "$HEAD_SHA" | cut -c1-7)

if [ -z "$PR_NUMBER" ] || [ -z "$HEAD_SHA" ] || [ -z "$BASE_REF" ]; then
  echo "Failed to resolve PR context."; exit 1
fi
```

## Fast-path — skip review when HEAD is a base-branch merge

**Collect-only mode: skip this entire fast-path section — do not run any of its commands — and continue straight to Step 2.**

If the head commit is just a merge of the base (default) branch into the PR branch — the common "keep up to date with main" merge — there is nothing novel for reviewers to look at on this push. In that case the `Claude Code Review` status is **inherited from the first parent** (the PR-branch tip before the merge): if the parent passed, this commit passes; if the parent failed, this commit fails — no reviewer is invoked and no PR comment is posted.

If the parent has **no** `Claude Code Review` status at all (never reviewed), the fast-path does NOT fire — that would hide unreviewed dev work behind an inherited status. It falls through to the full review, which diffs the PR via `gh pr diff` and covers all unreviewed work.

Detection, the parent-status read (across all status pages), the inherited-status post, and the pass/fail/none decision are all handled by the shipped script `scripts/detect-base-merge.sh`, invoked in a **single** shell command so nothing depends on shell state persisting across tool calls:

```bash
# Resolve repo + PR number and run the detector in ONE call (self-contained; no
# reliance on Step 1's shell variables persisting across separate tool calls).
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
  || { echo "Not inside a GitHub repo recognised by gh."; exit 1; }
PR_REF="${ARGUMENTS:-}"; PR_REF="${PR_REF#--collect-only}"; PR_REF="${PR_REF# }"
# shellcheck disable=SC2086  # PR_REF intentionally unquoted: empty -> omit arg.
PR_NUMBER=$(gh pr view $PR_REF --json number -q .number 2>/dev/null) \
  || { echo "No open PR found. Pass a PR number/URL or open a PR for the current branch."; exit 1; }

DETECT_SCRIPT="$PWD/.claude/skills/stack:pr-review/scripts/detect-base-merge.sh"
bash "$DETECT_SCRIPT" "$OWNER_REPO" "$PR_NUMBER"
```

Read the last `FAST_PATH_RESULT=` line the script prints:

- `success` or `failure` — the script has already posted the inherited `Claude Code Review` commit status. **Stop here:** report the result and exit. Do not invoke any reviewer, post any PR comment, or run any other step.
- `none` — no fast-path applies (not a base-merge, parent unreviewed, or a lookup failed). Continue to Step 2 and run the full review as normal.

## Step 1.5 — Locate the latest prior review comment and load state

This and the next three steps run in **all modes**, including `--collect-only`. They establish whether this is the first review or a continuation, and how much to re-review. Nothing here edits any comment — the run posts a _new_ comment in Step 4; prior comments are kept.

Every Claude review comment carries a hidden state marker at the top of its body:

```
<!-- claude-code-review:v1
last_reviewed_sha: <full 40-char sha>
human_signal: {"count": <int>, "latest": "<ISO8601 or empty>"}
open_findings: <single-line JSON array of {file,line,severity,title,reviewer}>
-->
```

List the PR's issue comments and pick the **most recent** one whose body contains `claude-code-review:v1` (highest id — there will normally be several, since we keep all):

```bash
COMMENTS_JSON=$(gh api "repos/$OWNER_REPO/issues/$PR_NUMBER/comments" --paginate \
  --jq '[.[] | {id, url: .html_url, body, login: .user.login, type: .user.type}]' 2>/dev/null) || COMMENTS_JSON="[]"
PRIOR=$(printf '%s' "$COMMENTS_JSON" | jq -c '[.[] | select(.body | contains("claude-code-review:v1"))] | sort_by(.id) | last // empty')
```

If `PRIOR` is empty → **first run**: set `PRIOR_COMMENT_URL`, `LAST_REVIEWED_SHA`, `OPEN_FINDINGS`, `PRIOR_HUMAN_SIGNAL` all empty. (Pre-existing unmarked comments are ignored and left untouched.)

Otherwise set `PRIOR_COMMENT_URL` to `PRIOR.url` and parse the marker block in `PRIOR.body` for `last_reviewed_sha` → `LAST_REVIEWED_SHA`, `open_findings` → `OPEN_FINDINGS`, and `human_signal` → `PRIOR_HUMAN_SIGNAL`. If the marker JSON is malformed, set `LAST_REVIEWED_SHA` and `OPEN_FINDINGS` empty (forces FULL re-review below) but keep `PRIOR_COMMENT_URL` for the back-link.

## Step 1.6 — Gather human-reviewer signal

Read **human-only** comments and review-thread state — used by the no-op guard (1.7) and reconciliation (Step 3). Exclude bots and the Claude review identity throughout (`type == "Bot"`, any `login` ending in `[bot]`, and the account that posts this review).

```bash
OWNER=${OWNER_REPO%%/*}; REPONAME=${OWNER_REPO##*/}

# General PR comments are already in COMMENTS_JSON from Step 1.5.
INLINE_JSON=$(gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/comments" --paginate \
  --jq '[.[] | {path, line, body, login: .user.login, type: .user.type, updated_at}]' 2>/dev/null) || INLINE_JSON="[]"
REVIEWS_JSON=$(gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews" --paginate \
  --jq '[.[] | {state, body, login: .user.login, submitted_at}]' 2>/dev/null) || REVIEWS_JSON="[]"
# Thread resolution state comes from the shipped script gather-review-threads.sh,
# which runs the one read-only reviewThreads GraphQL query internally. The skill
# therefore grants NO `gh api graphql` permission of its own — there is no general
# GraphQL surface to abuse; the only GraphQL that can run is that fixed read-only query.
THREADS_SCRIPT="$PWD/.claude/skills/stack:pr-review/scripts/gather-review-threads.sh"
THREADS_JSON=$(bash "$THREADS_SCRIPT" "$OWNER" "$REPONAME" "$PR_NUMBER" 2>/dev/null) || THREADS_JSON=""
```

If the script prints nothing (the query could not run — auth/permissions/availability), `THREADS_JSON` is empty — degrade to REST-only: the "thread resolved" prune signal is unavailable; only "line no longer in diff" remains. Warn and continue.

Compute the human-signal fingerprint `HUMAN_SIGNAL` from human (non-bot, non-Claude) entries only: `count` = number of human general comments + inline comments + review summaries; `latest` = max `updated_at`/`submitted_at` across them (empty if none). No human entries → `{"count":0,"latest":""}`.

## Step 1.7 — No-op guard (standalone only)

**Collect-only mode: skip this guard entirely** (like the fast-path) — a collect-only run must never post or exit early. Continue to Step 1.8.

Otherwise the guard fires only when **both** the code and the human signal are unchanged since the last review: `LAST_REVIEWED_SHA` is non-empty **and** equals `HEAD_SHA`, **and** `HUMAN_SIGNAL` equals `PRIOR_HUMAN_SIGNAL`. When it fires, re-affirm the commit status only and post no new comment:

```bash
# Re-affirm the prior gate (success unless OPEN_FINDINGS carried a High/Critical, in which case failure).
gh api "repos/$OWNER_REPO/statuses/$HEAD_SHA" \
  -f state=success \
  -f context="Claude Code Review" \
  -f description="No change since last review" \
  || { echo "Failed to re-affirm commit status."; exit 1; }
echo "No change since last review (same HEAD and same human signal). No new comment posted."
exit 0
```

(If `OPEN_FINDINGS` held a High/Critical finding, re-affirm `failure` with description `Failed - see PR comment` instead. The guard re-affirms the prior gate; it does not recompute it.)

If `HEAD_SHA == LAST_REVIEWED_SHA` but the human signal differs (a human acted), the guard does **not** fire: there is no new code to scan, so set `REVIEW_SCOPE=RECONCILE_ONLY` (Step 2 skips reviewer dispatch); Step 3 still composes and posts a new comment folding in the reconciliation.

## Step 1.8 — Delta-scope decision

First run (`LAST_REVIEWED_SHA` empty) → `REVIEW_SCOPE=FULL`. If Step 1.7 set `REVIEW_SCOPE=RECONCILE_ONLY`, keep it. Otherwise:

```bash
DELTA_MAX_FILES=5
DELTA_MAX_LINES=150
CMP=$(gh api "repos/$OWNER_REPO/compare/$LAST_REVIEWED_SHA...$HEAD_SHA" \
  --jq '{status: .status, files: ([.files[]?]|length),
         lines: ([.files[]?.additions]|add // 0) + ([.files[]?.deletions]|add // 0)}' 2>/dev/null) || CMP=""

if [ -z "$CMP" ]; then
  REVIEW_SCOPE=FULL
else
  CMP_STATUS=$(printf '%s' "$CMP" | jq -r '.status'); CMP_FILES=$(printf '%s' "$CMP" | jq -r '.files'); CMP_LINES=$(printf '%s' "$CMP" | jq -r '.lines')
  if [ "$CMP_STATUS" = "diverged" ] || [ "$CMP_FILES" -gt "$DELTA_MAX_FILES" ] || [ "$CMP_LINES" -gt "$DELTA_MAX_LINES" ]; then
    REVIEW_SCOPE=FULL
  else
    REVIEW_SCOPE=DELTA
  fi
fi
echo "Review scope: $REVIEW_SCOPE (compare ${CMP_FILES:-?} files / ${CMP_LINES:-?} lines)"

if [ "$REVIEW_SCOPE" = "DELTA" ]; then
  DELTA_DIFF_FILE=$(mktemp -t claude-code-pr-delta.XXXXXX.diff)
  DELTA_FILES_FILE=$(mktemp -t claude-code-pr-delta-files.XXXXXX.txt)
  gh api "repos/$OWNER_REPO/compare/$LAST_REVIEWED_SHA...$HEAD_SHA" -H "Accept: application/vnd.github.diff" > "$DELTA_DIFF_FILE" || REVIEW_SCOPE=FULL
  gh api "repos/$OWNER_REPO/compare/$LAST_REVIEWED_SHA...$HEAD_SHA" --jq '.files[].filename' > "$DELTA_FILES_FILE" 2>/dev/null || REVIEW_SCOPE=FULL
fi
```

(`diverged` covers force-push/rebase where the baseline is unreachable → FULL.)

## Step 2 — Discover and invoke installed reviewers

**Scoping rule (hard).** Only consider skills and agents whose source files live inside the **current working directory tree** (the value of `pwd` at skill-run time). Reviewers loaded from outside this tree — plugin marketplaces (`~/.claude/plugins/...` such as `compound-engineering:review:*`, `superpowers:*`), global skill caches, or any other location outside the project — are **out of scope** and MUST NOT be invoked, even if their name or description matches the regex below.

To verify scope: a candidate is in-scope only if its source file path begins with the current working directory. If you cannot confirm a candidate's source path is inside the working directory, exclude it.

Within that scope, match by name OR description against any of these patterns (case-insensitive):

- `code-review`, `pr-review`
- `*-reviewer`
- `correctness-reviewer`, `testing-reviewer`

Typical hits in this harness: `stack:code-reviewer`, plus per-domain reviewers like `stack:th-pr-review` when their stacks are installed. (Names without the `stack:` prefix are also valid if the file lives in the working directory.)

**Exclude the following from discovery (even if in scope):**

- `stack:pr-review` itself (prevent recursion)
- `stack:code-reviewer` (agent) — redundant with the `stack:code-review` skill where it exists; invoking both is token bloat. Prefer the skill.
- **Any security-related skill or agent** — temporarily disabled. This includes anything whose name or description matches `security`, `audit`, `auditor`, `vulnerability`, `owasp`, or similar (e.g. `stack:security-review`, `stack:security-auditor`). Re-enable in a follow-up once the security lens is reintegrated cleanly.
- Obviously off-topic items even if the regex brushes them

Before invoking any reviewer, snapshot the PR diff **once** from GitHub so every reviewer — root (Step 2) and subproject (Step 2b) — sees the same pushed state. These two files are the single source of truth for all diff/file placeholders below; nothing re-derives the diff from local `HEAD` or the working tree:

```bash
DIFF_FILE=$(mktemp -t claude-code-pr-diff.XXXXXX.diff)
FILES_FILE=$(mktemp -t claude-code-pr-files.XXXXXX.txt)
gh pr diff "$PR_NUMBER" --repo "$OWNER_REPO"             > "$DIFF_FILE"  || { echo "Failed to fetch PR diff."; exit 1; }
gh pr diff "$PR_NUMBER" --repo "$OWNER_REPO" --name-only > "$FILES_FILE" || { echo "Failed to fetch changed-file list."; exit 1; }
```

```bash
# Reviewer payload source depends on REVIEW_SCOPE (set in Step 1.8):
#   FULL          → use $DIFF_FILE / $FILES_FILE (the whole PR) below.
#   DELTA         → use $DELTA_DIFF_FILE / $DELTA_FILES_FILE (changes since the
#                   last-reviewed SHA), and hand reviewers the prior open findings
#                   ($OPEN_FINDINGS) so they can flag which the delta resolves.
#   RECONCILE_ONLY→ skip reviewer dispatch in Step 2 and Step 2b; go to Step 3 with
#                   an empty new-findings set.
# $FILES_FILE (the full changed-file list) is still the source of truth for Step 2b
# subproject gating in every scope.
```

If REVIEW_SCOPE is RECONCILE_ONLY, skip reviewer discovery and dispatch in both Step 2 and Step 2b (there is no new code to scan) and proceed directly to Step 3 with an empty new-findings set.

For each match, invoke it **in parallel** (single message, multiple `Agent`/`Skill` tool calls) with this uniform payload:

```
Review PR #<PR_NUMBER> at <PR_URL>.

Repo: <OWNER_REPO>
Head SHA: <HEAD_SHA>
Base ref: <BASE_REF>
Head ref: <HEAD_REF>

Review scope: <REVIEW_SCOPE>
<If FULL, label this "Full diff:" and use cat "$DIFF_FILE"; if DELTA, label it "Diff since last review (delta):" and use cat "$DELTA_DIFF_FILE".>

Changed files:
<If FULL, cat "$FILES_FILE"; if DELTA, cat "$DELTA_FILES_FILE".>

<If REVIEW_SCOPE is DELTA, also include:>
Previously-open findings (flag any this delta resolves, and any new issues it introduces):
<output of: printf '%s' "$OPEN_FINDINGS">

Recent commits:
<output of: gh pr view "$PR_NUMBER" --repo "$OWNER_REPO" --json commits --jq '.commits[] | "\(.oid[0:7]) \(.messageHeadline)"'>

Return your findings in your native format. Be specific: file:line, severity, issue, suggested fix.
```

Collect every reviewer's response. If a reviewer errors, capture the error string and continue with the others.

## Step 2b — Discover and invoke nested subproject reviewers (monorepos)

In a monorepo (e.g. `frontend`, with `apps/*` and `packages/*` subprojects), each subproject installs its **own** `.claude/` under a nested path — `apps/tcm/.claude/`, `packages/synergy/.claude/`, etc. Claude Code only **registers** skills and agents from the **repo-root** `.claude/`; reviewers in nested `.claude/` directories are never loaded into the skill registry, so they never appear as candidates in Step 2 and the `Skill`/`Agent`-by-name tools cannot invoke them. Discover and run them **by file path** instead. (Because invocation is by path, the fact that every subproject ships a skill with the _same_ name — `stack:code-review` — is irrelevant; there is no name collision.)

This path runs **in addition to** Step 2, not instead of it. Step 2's registered reviewers run on the diff selected by Step 1.8 (the **full** PR diff, or the **delta** since the last review); Step 2b's subproject reviewers run on a **subproject-scoped diff** (only the files under their subproject).

1. **Scan** for nested reviewer source files under the current working directory, excluding the repo-root `.claude/`. Use the **`Glob` tool** (not a shell `find`/`awk`) with each of these patterns, then union the results:
   - `**/.claude/skills/*.md`
   - `**/.claude/skills/*/SKILL.md`
   - `**/.claude/agents/*.md`

   `Glob` returns repo-relative paths. **Discard** any match whose `.claude` is the repo root — a path that begins with `.claude/` — since those reviewers are already registered and handled by Step 2. For each remaining match, derive:
   - **`<scopeDir>`** — the path segment before `/.claude/` (e.g. `apps/tcm`, the subproject the reviewer belongs to).
   - **`<sourceFile>`** — the full matched path.

   The three patterns pick up flat skills (`skills/<name>.md`), directory skills (`skills/<name>/SKILL.md`), and agents (`agents/<name>.md`), but NOT reference files nested deeper inside a skill dir.

2. **Filter** each candidate by reading its frontmatter `name`/`description` and applying the **same matching regex and the same exclusion list as Step 2**: drop `stack:pr-review`; drop any reviewer whose name/description matches `security`/`audit`/`auditor`/`vulnerability`/`owasp`; and when a single subproject ships both a `stack:code-review` skill and a `stack:code-reviewer` agent, keep only the skill (the agent is redundant).

3. **Gate by changed files.** A nested reviewer is _affected_ only if at least one path in `$FILES_FILE` (the changed-file snapshot captured in Step 2) begins with `<scopeDir>/`. Skip reviewers whose subproject this PR does not touch — files that fall outside every subproject (or inside a subproject with no reviewer) are still covered by Step 2's root reviewers on the full diff.

4. **Invoke each affected reviewer** in parallel (same single-message, multiple-`Agent`-call batch style as Step 2). Since the reviewer is not registered, you cannot call it via the `Skill` tool — instead `Read` its source file and dispatch a general-purpose `Agent` whose prompt is:

```
You are acting as the reviewer defined by the instructions below, loaded from
<sourceFile> in subproject <scopeDir>. Follow those instructions to review this
PR. Resolve any relative paths the instructions reference (references/, scripts/,
CLAUDE.md) against <scopeDir>/.

Reviewer instructions:
<full body of the reviewer's SKILL.md / agent .md, verbatim>

---

Review PR #<PR_NUMBER> at <PR_URL>, scoped to subproject <scopeDir>.

Repo: <OWNER_REPO>
Head SHA: <HEAD_SHA>
Base ref: <BASE_REF>
Head ref: <HEAD_REF>

Subproject diff (files under <scopeDir>/ only):
<output of: gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/files" --paginate --jq '.[] | select(.filename | startswith("<scopeDir>/")) | "diff --git a/\(.filename) b/\(.filename)\n\(.patch)"'>

Changed files in this subproject:
<output of: gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/files" --paginate --jq '.[] | select(.filename | startswith("<scopeDir>/")) | .filename'>

Return your findings in your native format. Be specific: file:line, severity,
issue, suggested fix. Do NOT post a commit status or PR comment and do NOT run
any status/post script — the orchestrator owns the single Claude Code Review
status and PR comment. Return findings only.
```

Collect each subproject reviewer's response exactly as in Step 2; a reviewer that errors is captured and the run continues. When aggregating in Step 3, **label these reviewers by scope dir** to disambiguate identical names — e.g. `stack:code-review (apps/tcm)`, `stack:code-review (apps/o11y)`.

**Fallback.** If discovery across **both Step 2 and Step 2b** yields zero in-scope reviewers, invoke Claude Code's built-in `/review` skill (the simple PR-review that ships with Claude Code) and use its output as the sole reviewer signal. Do NOT fall back to out-of-scope reviewers from plugin marketplaces — they are intentionally excluded.

The 18-row scaffold below is the canonical Review Table structure used in Step 3 (regardless of which reviewers ran):

| Priority | Category    | Check                                               |
| -------- | ----------- | --------------------------------------------------- |
| High     | Security    | No hardcoded secrets or credentials                 |
| High     | Security    | Authentication/authorization checks present         |
| High     | Security    | Input validation and sanitization                   |
| High     | Security    | No IDOR — resource ownership validated              |
| High     | Security    | No SQL injection (parameterized queries)            |
| High     | Correctness | Logic is correct, handles edge cases                |
| High     | Correctness | Error handling is explicit, no swallowed exceptions |
| High     | Correctness | No race conditions or concurrency issues            |
| Medium   | Testing     | New code has corresponding tests                    |
| Medium   | Testing     | Error paths and edge cases tested                   |
| Medium   | Testing     | Existing tests still pass (no regressions)          |
| Medium   | Performance | No N+1 queries or unbounded data fetching           |
| Medium   | Performance | Long-running tasks use background jobs              |
| Medium   | Quality     | Follows existing codebase patterns                  |
| Medium   | Quality     | Changes are focused (single concern)                |
| Low      | Quality     | Meaningful names, no dead code                      |
| Low      | Quality     | Comments explain why, not what                      |
| Low      | Quality     | No unnecessary dependencies added                   |

## Step 3 — Compose the report

Create two temp files — the markdown report, and a JSON file for the inline review comments:

```bash
REPORT_FILE=$(mktemp -t claude-code-pr-review.XXXXXX.md)
FINDINGS_FILE=$(mktemp -t claude-code-pr-review-findings.XXXXXX.json)
```

**Continuation composition.** Every run composes a fresh, self-contained comment body (the run always posts a _new_ comment; prior comments are kept untouched).

- The body MUST begin with the state marker, rebuilt with this run's state:
  ```
  <!-- claude-code-review:v1
  last_reviewed_sha: <HEAD_SHA>
  human_signal: <HUMAN_SIGNAL fingerprint JSON, e.g. {"count":3,"latest":"2026-06-24T12:00:00Z"}>
  open_findings: <cumulative_open as a single-line JSON array of {file,line,severity,title,reviewer}>
  -->
  ```
- On a continuation (`PRIOR_COMMENT_URL` non-empty), add a line under the header:
  `_Continues [the previous review](<PRIOR_COMMENT_URL>) — changes since `<LAST*REVIEWED_SHA short>` (<FULL re-review | delta | reconcile-only>).*`
  Omit this line on a first run.
- The **Findings** section lists the **cumulative open set** (this run's new findings plus carried-forward unresolved ones). List resolved carried-forward findings struck-through with the reason, e.g. `~~`path:line` High — title~~ Resolved — thread resolved by @user`.
- Add a `### Raised by other reviewers (not independently confirmed)` subsection for unconfirmed human concerns (non-gating; omit the heading if none).

**Reconciliation (Moderate authority, every change attributed)** using the human signal from Step 1.6:

- **Prune** a carried-forward finding only on a clear signal — its `file:line` is in a **resolved** review thread (`THREADS_JSON`), or the line is **no longer present** in the current diff. Strike it through with the reason and the `@user`.
- **Add** a human-raised concern as a finding **only if you independently inspect the code and agree** (`Raised by @user — confirmed`); it affects the gate only when rated High/Critical.
- **Unconfirmed** human concerns go under the "Raised by other reviewers" subsection — never silently dropped, never gating.

**Cumulative finding set:** `cumulative_open = (prior OPEN_FINDINGS − resolved) + new findings (incl. confirmed human ones)`. The verdict is computed from `cumulative_open`, not just this run's findings: **FAIL if any finding in `cumulative_open` is High/Critical (or any High Review-Table row fails), else PASS** — same canonical verdict line and vocabulary as below.

The report must follow this exact structure (preceded by the marker block, and on a continuation by the "Continues …" line):

```markdown
# Claude Code PR Review

**PR:** <PR_URL> • **Head:** <HEAD_SHORT> • **Reviewers:** <comma-separated reviewer names — root reviewers from Step 2 plus subproject reviewers from Step 2b labelled by scope dir, e.g. `stack:code-review (apps/tcm)`; or "fallback inline checklist" if none discovered>

## Summary

<one-line description of what the PR does, synthesized from diff + commit messages>

## Review Table

| Priority                                                                            | Category | Check                               | Status        | Notes |
| ----------------------------------------------------------------------------------- | -------- | ----------------------------------- | ------------- | ----- |
| High                                                                                | Security | No hardcoded secrets or credentials | Pass/Fail/N/A | …     |
| ... (all 18 rows from the fallback table above, populated from aggregated findings) |

## Findings

<For each Fail item, consolidated across reviewers:>

- **File:** `path/to/file:line`
- **Severity:** Critical | High | Medium | Low
- **Reviewer:** <reviewer name>
- **Issue:** <what is wrong>
- **Suggestion:** <how to fix>

<If a reviewer errored, include a line:>

> ⚠️ `stack:foo-reviewer` errored: <error string>

---

**Verdict: PASS**
```

**Verdict rule (apply exactly):**

- If any **High** priority row in the table is `Fail`, OR any finding has severity `Critical` or `High` → write a **negative** verdict (canonical: `**Verdict: FAIL**`).
- Otherwise → write a **positive** verdict (canonical: `**Verdict: PASS**`).

The final verdict line must match `**Verdict: <word>**` where `<word>` (case-insensitive) is one of:

- **Positive (→ commit status `success`):** `PASS`, `PASSED`, `APPROVE`, `APPROVED`, `OK`, `LGTM`, `GOOD`, `SUCCESS`
- **Negative (→ commit status `failure`):** `FAIL`, `FAILED`, `REJECT`, `REJECTED`, `BLOCK`, `BLOCKED`, `NEEDS-WORK`, `CHANGES-REQUESTED`

Trailing prose after the closing `**` is allowed (e.g. `**Verdict: APPROVE** — solid, well-tested implementation.`), but the verdict word itself must be a single token from the lists above. Prefer the canonical `PASS` / `FAIL` for consistency; the synonyms exist so a slightly off-spec line still resolves cleanly instead of silently dropping the commit status.

### Step 3b — Emit the inline-comment findings JSON

In addition to the markdown report, write the **anchorable** findings to `$FINDINGS_FILE` as a JSON array. These become inline review comments in Step 4, posted as a single PR review. The full report (with _every_ finding, anchorable or not) still posts as the PR comment, so nothing is lost by leaving a finding out of this file.

**Anchorable** = the finding's `file:line` lands on an added/modified line of the diff this run actually reviewed — `$DIFF_FILE` on a FULL run, `$DELTA_DIFF_FILE` on a DELTA run. (Carried-forward findings from the prior review are not re-anchored — they live in the comment body only. On a RECONCILE*ONLY run there is no new diff, so write an empty array.) GitHub rejects inline comments on lines outside the diff, and because the reviews API is **all-or-nothing**, a single bad anchor causes the \_entire* review (all inline comments) to 422 and post nothing. So include a finding here only when you have confirmed its exact line is in the diff. When unsure, leave it out — it is still covered by the report comment.

**Non-anchorable** (omit from this file, keep in the report only): file-level or cross-file findings, deletions, repo-hygiene notes, or any finding whose line you cannot confirm is in the diff.

Each array element is a reviews-API comment object:

```json
[
  {
    "path": "relative/path/from/repo/root.ext",
    "line": 42,
    "side": "RIGHT",
    "body": "**[High] Short issue title**\n\nWhat is wrong, in one or two sentences.\n\n**Suggestion:** how to fix.\n\n_Reviewer: stack:code-review_"
  }
]
```

Field rules:

- **`path`** — repo-relative, exactly as it appears in `$FILES_FILE` (the `gh pr diff --name-only` captured in Step 2; no leading `/`).
- **`line`** — the line number on the **RIGHT** (PR/new) side of the diff for an added or modified line. For a comment on a **deleted** line, use the LEFT line number and set `"side": "LEFT"`.
- **`side`** — `"RIGHT"` for added/modified lines (the common case), `"LEFT"` only for deleted lines.
- **Multi-line range** — add `"start_line": <N>` and `"start_side": "RIGHT"`; `line` is then the end of the range.
- **`body`** — self-contained markdown for that one finding: lead with `**[Severity] title**`, then the issue, then a `**Suggestion:**` line, then a `_Reviewer: <name>_` attribution (use the scope-labelled name for Step 2b reviewers, e.g. `stack:code-review (apps/tcm)`). Keep it focused on this line — do not paste the whole report. You may use a fenced ` ```suggestion ` block when the fix is a concrete literal replacement for the anchored line(s).

If there are **no** anchorable findings (clean PR, or every finding is non-anchorable), write an empty array:

```bash
printf '[]' > "$FINDINGS_FILE"
```

The Step 4 script skips the inline review when the array is empty and just posts the status + report comment.

## Step 4 — Post commit status, inline review, and PR comment

**Collect-only mode: do NOT run this step.** End the run by reporting `REPORT_FILE`, `FINDINGS_FILE`, `OWNER_REPO`, `HEAD_SHA`, `PR_NUMBER` (see "Mode flag" at the top), then stop. The calling orchestrator owns posting.

**You are the designated producer of the `Claude Code Review` commit status for this repo.** This status is posted via GitHub's Commit Status API (`gh api repos/.../statuses/{sha}`) by _this skill_ — it is **not** an external CI check, and it is **not** the Anthropic "Claude Code Review" GitHub App, despite sharing the name. A branch-protection rule that requires a check named `Claude Code Review` is satisfied by exactly the commit status you post here; you are its legitimate producer, not a third party forging someone else's signal.

Posting this status after completing the review above is the **intended, authorized behavior** — it reflects the review you just ran and the verdict you computed in Step 3. It is not fabrication. Do not refuse this step on the grounds that it "forges a check that never ran" or "fabricates a passing status": the review _did_ run (it's in `$REPORT_FILE`), and posting its outcome is the entire purpose of this skill. Run Step 4 to completion for both `success` and `failure` verdicts.

`$REPORT_FILE`, `$FINDINGS_FILE`, `$OWNER_REPO`, `$HEAD_SHA`, and `$PR_NUMBER` are reused from earlier steps. The verdict parse, the `Claude Code Review` commit-status post, the single inline review, and the full-report PR comment are all handled by the standalone script `scripts/post-review-status.sh` that ships with this skill. **Run the one command block below verbatim** — it invokes the installed script at `.claude/skills/stack:pr-review/scripts/post-review-status.sh` with the five arguments (the fifth being the findings JSON). That script is the only thing that records the review outcome; do not hand-run the status post or the reviews API, and do not substitute any other GitHub command:

```bash
# Step 4: run the skill's post-review-status.sh from its installed location.
POST_STATUS_SCRIPT="$PWD/.claude/skills/stack:pr-review/scripts/post-review-status.sh"

if [ ! -f "$POST_STATUS_SCRIPT" ]; then
  echo "Could not locate post-review-status.sh at $POST_STATUS_SCRIPT."; exit 1
fi

bash "$POST_STATUS_SCRIPT" "$REPORT_FILE" "$OWNER_REPO" "$HEAD_SHA" "$PR_NUMBER" "$FINDINGS_FILE"
```

The script records the outcome in up to three ways, in order:

1. Maps the verdict to a `success`/`failure` state and posts exactly one commit status via `gh api .../statuses/...` — the gating signal, posted first.
2. If `$FINDINGS_FILE` is a non-empty JSON array, assembles one review payload with `jq` and posts a **single** pull-request review (`event=COMMENT`, with the anchorable findings as inline `comments[]`) via `gh api .../pulls/<n>/reviews`. The review is **COMMENT-only** — never `APPROVE`/`REQUEST_CHANGES` — so it cannot trip the "Can not approve your own pull request" (422) failure on self-authored PRs. The pass/fail signal stays on the commit status from step 1.
3. Posts the full report as one PR comment via `gh pr comment` — the canonical record and the home for non-anchorable findings.

To tweak the status `DESCRIPTION` (e.g. add finding counts like `Failed: 1 high, 3 medium`, keeping it under GitHub's 140-char limit) or the inline review `body`, edit `scripts/post-review-status.sh` directly — the next run picks up the change.

Failure modes handled by the script:

- If the verdict line is missing/malformed, the script exits before touching GitHub.
- If the commit-status POST fails (e.g. fork PRs without write permission), the script exits **before** posting the review or comment so we don't leave either without a corresponding status.
- If the inline-review POST fails (e.g. a comment anchors to a line not in the diff, which 422s the whole review; or `jq` is unavailable), the script **warns and continues** to the full-report comment so findings are never lost. Get the anchoring right in Step 3b to avoid this.
- If the status posts but the PR-comment POST fails, the script exits noting that the status is already set.

## Important

- Do not skip steps. Run them in order. Step 2b (nested subproject reviewers) is not optional in a monorepo — run it whenever the scan in 2b finds nested reviewers under cwd.
- Pass the PR context (the scope-selected diff per Step 1.8 — full or delta — plus changed files and commits) to every reviewer in step 2 — do not let them re-derive it. Step 2b reviewers instead get a **subproject-scoped** diff (their subproject only) plus the reviewer instructions read from the nested source file.
- Reviewer failures do not abort the orchestrator; aggregate what you got.
- The final `**Verdict: <word>**` line is the contract. Prefer canonical `PASS` / `FAIL`; the parser also accepts synonyms (`APPROVE`/`APPROVED`/`LGTM`/`OK`/… for pass; `REJECT`/`BLOCK`/`NEEDS-WORK`/`CHANGES-REQUESTED`/… for fail) and trailing prose after the closing `**`.
- The pass/fail signal is the **commit status**, not the review event. The inline review is always submitted with `event=COMMENT` (never `APPROVE`/`REQUEST_CHANGES`) so it works on self-authored PRs; the verdict only drives the `success`/`failure` commit status.
- `$FINDINGS_FILE` must contain **only** anchorable findings (line confirmed in the diff). The reviews API is all-or-nothing — one bad anchor 422s the whole inline review. When in doubt, leave a finding out of the JSON; it still appears in the full-report PR comment.
- For fork PRs where the commit-status endpoint lacks write permission, the failure is surfaced as-is.
- In collect-only mode (`--collect-only` as the first token of `$ARGUMENTS`): skip the fast-path **and the Step 1.7 no-op guard**, run Steps 1–3 (including 1.5/1.6/1.8 and the reconciliation/continuation composition), never post anything, and end by reporting `REPORT_FILE`, `FINDINGS_FILE`, `OWNER_REPO`, `HEAD_SHA`, `PR_NUMBER`. Step 4 is owned by the calling orchestrator (e.g. `stack:workspace-pr-review`).
- Each run posts a NEW "Claude Code PR Review" comment that CONTINUES the latest prior one (found by the hidden `claude-code-review:v1` marker): it carries forward still-open findings, reconciles with human reviewers, and recomputes a cumulative verdict. Prior comments are intentionally kept as a timeline — they are never edited or deleted.
- Re-running on an unchanged PR (same HEAD and same human signal) posts no new comment; it only re-affirms the commit status (Step 1.7). Collect-only mode skips that guard.
- The gate is cumulative: the verdict is computed from carried-forward open findings plus this run's findings, so an earlier unresolved High keeps the status red even when a small delta is clean.
- Reconciliation is Moderate-authority: prune only on a resolved thread or a line no longer in the diff; add a human concern only when independently confirmed; attribute every change.
