---
name: stack:resolve-dependabot-security
description: "Use when resolving open Dependabot dependency-security tickets for a11y-engine. Targets AXE Jira stories with Source=Security that carry a Dependabot signature (children of the SC-1097 Dependabot Alerts Tracker, or any Source=Security ticket whose description has a Package + Package File). Lists and lets you curate the tickets, finds or creates each dependency-bump PR, combines them into one a11y-engine bulk PR plus a separate a11y-engine-axe-core submodule bulk PR, runs checks + code review, classifies per-dependency product-impact/risk for manual review, then on your sign-off publishes and moves tickets to In Review. Triggers - resolve dependabot tickets, fix security dependencies, patch vulnerable deps, dependabot security, clear the dependabot alerts tracker."
disable-model-invocation: true
argument-hint: "[TICKET-KEY...] [dry-run]   (no args = auto-discover the open set)"
---

# Resolve Dependabot Security Tickets (a11y-engine)

Resolve the open **Dependabot dependency-security** tickets end-to-end: discover them in Jira, let you
curate the set, ensure every ticket has a fix PR, **combine them into one bulk PR per repo** for a single
review + test pass, classify each dependency's product risk, and — after your sign-off — publish and move
the tickets to review.

This skill is an **orchestrator**. It reuses `stack:trigger-pr-checks`, `stack:code-review`, `stack:submit-pr`,
and `stack:publish-workflow` rather than reimplementing them. It writes to Jira and GitHub, so it runs
**interactively with hard gates** and supports `dry-run`.

## Verified facts (do not re-derive)

| Thing | Value |
|---|---|
| Jira site (`cloudId`) | `browserstack.atlassian.net` |
| Jira project | `AXE` (name "AXE++") |
| "Source" field | `customfield_10104`; JQL `cf[10104] = "Security"` |
| Dependabot tracker (common parent) | `SC-1097` — "[Security] Dependabot Alerts Tracker" |
| Main repo | `browserstack/a11y-engine` |
| axe-core submodule repo | `browserstack/a11y-engine-axe-core` (mounted at `axe-core/`) |
| Dependabot PR author | `app/dependabot` |
| Node | `18.20.4` (`nvm use 18.20.4`) |
| Product-impact folders | `axe-core/` (submodule), `dom-forge-core/`, `a11y-engine-core/` (excl. `test/examples/**`), `ip-protection/` |
| Review status | "In Review" **exists** but is **not** a one-hop from "New Item" — walk transitions to reach it |

## When to use

- You want to clear the open Dependabot dependency vulnerabilities for a11y-engine in one coordinated pass.
- A specific set of AXE security tickets needs its dependency bumps applied, reviewed together, and shipped.

**Not for** the other Source=Security ticket types — `[container-vuln]`, `[Nuclei]`, `[malware]`,
`[supply-chain-lint]`, dev-mode hardening, or code findings. Those are **excluded** in Phase 1 (they have no
Dependabot Package/Package File signature). If one is mis-included, remove it at the Phase 2 gate.

## Arguments (`$ARGUMENTS`)

- **`TICKET-KEY...`** — optional explicit AXE keys to seed the working set (e.g. `AXE-3768 AXE-3759`). Still
  goes through the Phase 2 curation gate. Omit to auto-discover.
- **`dry-run`** — do everything read-only: discover, classify, and print the plan (tickets, matched PRs,
  bulk-PR shape, risk report). **No** branches, commits, pushes, PRs, comments, transitions, or publish.
  Always safe; run this first.

## Preflight

```bash
gh auth status || { echo "gh not authenticated — run 'gh auth login'."; exit 1; }
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
case "$OWNER_REPO" in
  */a11y-engine|*/a11y-engine-axe-core) : ;;
  *) echo "Run this from a local checkout of browserstack/a11y-engine. Found: ${OWNER_REPO:-none}"; exit 1 ;;
esac
nvm use 18.20.4 2>/dev/null || echo "warn: nvm 18.20.4 not active — builds/tests may misbehave."
```

Also confirm the **Atlassian MCP** tools are available (`mcp__claude_ai_Atlassian_Rovo__*`). If not, Jira
discovery and the end-state transition cannot run — stop and tell the user.

Parse args: collect any `AXE-\d+` tokens as the seed set; set `DRYRUN=1` if `dry-run` is present.

## Phases

| # | Phase | Writes? | Detail |
|---|---|---|---|
| 1 | **Discover** the open Dependabot security tickets | read | `references/jira.md` |
| 2 | **Curate gate** — you add/remove tickets | — | inline below |
| 3 | **Ensure a fix PR** exists per ticket (find or create) | GitHub | `references/bulk-pr.md` |
| 4 | **Build the bulk PR(s)** — a11y-engine + axe-core submodule | GitHub | `references/bulk-pr.md` |
| 5 | **Sync + checks + code review** on the bulk PR(s) | GitHub | inline below |
| 6 | **Risk report** — per-dependency product impact | — | `references/risk-classification.md` |
| 7 | **Human gate** — present PRs + risk, STOP for sign-off | — | inline below |
| 8 | **Merge + publish + Jira** — merge PR(s), `stack:publish-workflow`, → In Review | GitHub + Jira | inline + `references/jira.md` |

### Execution flow

```
Phase 1  discover ─► Phase 2  YOU curate the set ◄── hard gate
                          │
                          ▼
Phase 3  per ticket: find Dependabot PR, else create the bump PR
                          │  (grouped by repo)
          ┌───────────────┴───────────────┐
          ▼                               ▼
  a11y-engine-axe-core             a11y-engine
  bulk PR (Phase 4a)   ──commit──► bulk PR (Phase 4b, bumps submodule pointer)
                                          │
                                          ▼
                    Phase 5  sync main · RUN_CHECKS+RUN_UNIT_TESTS · stack:code-review
                                          │
                                          ▼
                    Phase 6  risk report (High/Med/Low + manual-review flags)
                                          │
                                          ▼
                    Phase 7  present PRs + risk ─► STOP ◄── hard gate (your sign-off)
                                          │
                                          ▼
                    Phase 8  stack:publish-workflow ─► tickets → In Review
```

### Phase 1 — Discover

Follow `references/jira.md` § Discover. In short: run the Source=Security JQL, keep only tickets with the
**Dependabot signature** in the a11y-engine family, and parse each ticket's package, lockfile path, target
version, CVSS, advisory, and any linked Dependabot PR. If `TICKET-KEY...` args were given, fetch those keys
directly and still validate/parse them the same way.

### Phase 2 — Curate gate (required, always)

Print the discovered set as a table — **key · package · bump (from→to) · lockfile path · repo · CVSS ·
blast-radius · matched PR / none** — then **stop** and ask:

> Proceed with these N tickets? You can **add** keys I missed (`add AXE-1234 …`) and **remove** any you
> don't want solved this run (`remove AXE-5678 …`). Reply `go` to continue with the curated set.

Apply edits (fetch + parse any added keys), reprint the final set, and only then continue. In `dry-run`, still
show the gate but note nothing after it will execute.

### Phase 3 — Ensure a fix PR per ticket

Follow `references/bulk-pr.md` § Ensure a fix PR. For each curated ticket: locate its open Dependabot PR
(match by package + lockfile directory + target version, cross-checked against the PR URL in the ticket); if
none exists, create the bump on its own branch and open a PR. Group results by repo (`a11y-engine` vs
`a11y-engine-axe-core`).

### Phase 4 — Build the bulk PR(s)

Follow `references/bulk-pr.md` § Build bulk PRs (**merge method**). If any axe-core tickets are in scope,
build the **axe-core bulk PR first** (in `a11y-engine-axe-core`), then build the **a11y-engine bulk PR** and
**bump the `axe-core` submodule pointer** to the axe-core bulk branch's head commit. If no axe-core tickets,
build only the a11y-engine bulk PR.

### Phase 5 — Sync + checks + code review

Run this **per bulk PR, from that repo's checked-out bulk branch** — `stack:code-review` reviews the local
`git diff` and `stack:trigger-pr-checks` reads the repo from cwd, so you must be *in* the right checkout.

Sync with the repo's default branch:
```bash
git fetch origin && git merge --no-edit origin/<default>   # main for a11y-engine; resolve conflicts per references/bulk-pr.md
git push
```

**CI triggers differ by repo:**
- **a11y-engine bulk PR** — its Jenkins jobs are comment-only, so trigger them (skip in `dry-run`):
  ```
  /stack:trigger-pr-checks <a11y-engine-bulk-pr>     # posts RUN_CHECKS + RUN_UNIT_TESTS, deduped per commit
  ```
  `stack:trigger-pr-checks` is **a11y-engine-only** — it hard-refuses any other repo and resolves the repo
  from cwd. **Do not** call it for the axe-core PR.
- **a11y-engine-axe-core bulk PR** — rely on whatever CI that repo runs on its own PRs; do **not** use
  `stack:trigger-pr-checks`. If it too uses comment-triggered jobs, post the appropriate comment manually.

**Read the results** (both repos) — don't trigger-and-assume-green:
```bash
gh pr checks <pr> --repo <repo>                                                  # check-run summary
gh api "repos/<repo>/commits/<head-sha>/statuses" \
  --jq 'group_by(.context)[] | {context: .[0].context, state: .[0].state}'       # RUN_CHECKS/RUN_UNIT_TESTS contexts
```

Then review each bulk branch (skip in `dry-run`):
```
/stack:code-review                            # run from the checked-out bulk branch — reviews its diff
```

Capture, per bulk PR, the check states and the `stack:code-review` verdict — both feed the risk report and
the Phase 7 gate. Treat a non-green check or a `stack:code-review` BLOCK as a manual-review trigger (Phase 6).

### Phase 6 — Risk report

Follow `references/risk-classification.md`. Produce a per-dependency table sorted by risk with
**High / Medium / Low** and a **manual-review-required** flag + one-line rationale, factoring blast radius,
semver jump, runtime-vs-dev, CVSS, and any check/review failures from Phase 5.

### Phase 7 — Human gate (required)

Present, then **STOP**:
- Bulk PR link(s) + check states (RUN_CHECKS/RUN_UNIT_TESTS, or the axe-core repo's own CI) + `stack:code-review` verdict.
- The risk report, **manual-review items first**.
- The tickets that will move to In Review on sign-off.

Approval here authorizes Phase 8 **in full** — merging the bulk PR(s) *and* running the heavy publish. Do
**not** proceed until the user explicitly approves (e.g. `publish`). In `dry-run`, end here — nothing after
this point runs.

### Phase 8 — Merge + publish + Jira

On approval only, **in this order** (GitHub state matters for the submodule):

1. **Merge the axe-core bulk PR first** (if any). Then in the a11y-engine bulk branch **re-point the submodule
   to the axe-core PR's merged commit** on its default branch — not the pre-merge `AXE_CORE_BULK_SHA` — push,
   and let its CI re-run. See `references/bulk-pr.md`.
2. **Merge the a11y-engine bulk PR** once its checks are green on the re-pointed commit.
3. **Publish:** run `stack:publish-workflow` (canonical staging publish + validation). It is **heavy and
   interactive** — it needs an engine version string, branch names, local repo paths, and Chrome + Slack for
   its Jenkins/Slack gate checks, plus a manual deploy step. Surface these prerequisites before starting it;
   it collects its own parameters.
4. **Jira:** for each **resolved** ticket — one whose bump actually landed in a merged bulk PR — transition it
   to **In Review** and comment the bulk-PR URL(s) (`references/jira.md` § Move to In Review). Leave and report
   any ticket whose bump was excluded, failed CI, or wasn't merged.

## Output

End with: curated ticket list, bulk PR URL(s), CI + review status, the risk report, publish result, and the
Jira transition results (which tickets moved to In Review, which were left and why).

## Common mistakes

- **Treating every Source=Security ticket as a dependency bump.** Only ~2 of ~11 open ones are Dependabot
  bumps; the rest are container/Nuclei/malware/lint/code findings. Gate on the Package/Package File signature.
- **Editing `axe-core/` as if it were part of a11y-engine.** It is a submodule (its own repo). Its bumps go
  in a **separate** `a11y-engine-axe-core` bulk PR; a11y-engine only moves the submodule **pointer**.
- **Assuming a direct New Item → In Review transition.** It doesn't exist — walk the workflow (see jira.md).
- **Running `stack:trigger-pr-checks` on the axe-core PR.** It's a11y-engine-only (hard repo guard, cwd-based)
  — use the axe-core repo's own CI there, and read every PR's checks rather than assuming they went green.
- **Merging the a11y-engine PR while the submodule points at an unmerged axe-core commit.** Merge axe-core
  first, re-point to its *merged* commit, then merge a11y-engine (Phase 8).
- **Skipping the curation gate or the sign-off gate.** Both are required, every run, including when args
  seeded the set.
- **Forgetting `frontend-*` tickets live under SC-1097 too.** Scope to the a11y-engine family only.

## See also

- `references/jira.md` — discovery JQL, Dependabot-signature classification, field parsing, In Review transition
- `references/bulk-pr.md` — find-or-create PRs, two bulk PRs, submodule pointer, lockfile conflicts
- `references/risk-classification.md` — the product-impact/risk rubric
- `../stack:trigger-pr-checks/` · `../stack:code-review.md` · `../stack:submit-pr/` · `../stack:publish-workflow/`
