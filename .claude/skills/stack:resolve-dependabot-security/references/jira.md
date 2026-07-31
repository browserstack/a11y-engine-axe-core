# Jira — discovery, classification, and the In Review transition

All calls use the Atlassian MCP tools (`mcp__claude_ai_Atlassian_Rovo__*`) with `cloudId =
browserstack.atlassian.net`.

## Discover

### 1. Query the open Source=Security tickets

`searchJiraIssuesUsingJql` with:

```
project = AXE AND cf[10104] = "Security" AND statusCategory != Done ORDER BY updated DESC
```

Request only the fields you need to keep the payload small:
`["key","summary","status","parent","assignee","description"]`, `maxResults: 100`,
`responseContentFormat: "markdown"`.

> **Assignee is ignored** for inclusion — do **not** filter by `assignee = currentUser()` or `IS EMPTY`.
> Tickets assigned to anyone (or no one) are all in scope; the human curates in Phase 2.

If the result is large, it is saved to a file — use `jq` on it rather than reading it whole:

```bash
jq -r '.issues.nodes[] | "\(.key) | \(.fields.status.name) | parent=\(.fields.parent.key // "NONE") | \(.fields.summary)"' "$FILE"
```

If `TICKET-KEY...` args were passed, fetch each with `getJiraIssue` (fields `["summary","status","parent","description"]`,
`responseContentFormat: "markdown"`) instead of / in addition to the JQL, then classify them the same way.

### 2. Keep only Dependabot-signature tickets

A ticket is an in-scope **Dependabot dependency bump** when **both** hold:

**(a) It has the Dependabot signature** — either:

- `parent.key == "SC-1097"`, **or**
- its description contains **all** of: a `**Package:**` line, a `**Package File:**` line pointing at a
  `package.json` / `package-lock.json` path, and the note _"Dependabot automatically creates PR…"_.

**(b) It is NOT another security-scanner type.** Exclude when the summary starts with any of
`[container-vuln]`, `[Nuclei]`, `[malware]`, `[supply-chain-lint]`, or when there is **no** `**Package File:**`
in the description (code findings, dev-mode hardening, etc.).

> Example split from a real run: of 11 open Source=Security tickets, only `AXE-3768` and `AXE-3759` (both
> `ws` DoS, under SC-1097) qualify; the other 9 (`[container-vuln]`, `[Nuclei]`, `[malware]`,
> `[supply-chain-lint]`, dev-mode, a code finding) are excluded.

### 3. Scope to the a11y-engine family (drop `frontend-*`)

SC-1097 also tracks other repos. Determine each ticket's repo from the **Dependabot PR URL** in the
description (`github.com/browserstack/<repo>/pulls?...author:dependabot`), falling back to the summary prefix:

| Summary prefix / PR URL repo                          | Repo                                            | Bulk PR             |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------- |
| `a11y-engine-axe-core-*` / `…/a11y-engine-axe-core/…` | `browserstack/a11y-engine-axe-core` (submodule) | axe-core bulk PR    |
| `a11y-engine-*` / `…/a11y-engine/…`                   | `browserstack/a11y-engine`                      | a11y-engine bulk PR |
| `frontend-*` / other                                  | —                                               | **excluded**        |

### 4. Parse each in-scope ticket

The description carries structured fields — extract them (they drive matching and the risk report):

| Field             | Source line                                                                                                                                                                                                                                                    | Used for                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Package           | `**Package:** <name>`                                                                                                                                                                                                                                          | join key to the Dependabot PR       |
| Package File      | `**Package File:** <path>`                                                                                                                                                                                                                                     | directory + repo + blast radius     |
| Target version    | canonical = the Dependabot PR's "to" version; the advisory `fixed in <pkg>@<ver>` is the **minimum** acceptable. If no PR yet, bump to the advisory's fixed version (or newer). If they disagree, prefer the PR target as long as it's ≥ the advisory minimum. | the bump target                     |
| CVSS              | `**CVSS Score:** <n>`                                                                                                                                                                                                                                          | risk severity                       |
| Advisory          | `**GitHub Advisory:** <url>`                                                                                                                                                                                                                                   | reference in PR body                |
| Dependabot PR URL | the note's `…/pulls?...` search URL                                                                                                                                                                                                                            | confirms the repo, speeds PR lookup |

Note that the **same CVE can span multiple tickets/modules** (e.g. `ws` in `a11y-engine-ws` **and**
`a11y-engine-axe-core-ws`). Keep them as separate tickets — each maps to its own lockfile/repo — but one
dependency bump may satisfy several tickets. Track which tickets a given bump resolves so Phase 8 transitions
all of them.

## Move to In Review (Phase 8)

"In Review" exists in the AXE workflow but is **not** directly reachable from "New Item". Discover and walk
the transitions per ticket rather than hard-coding transition IDs (IDs are workflow-specific and can change):

1. `getTransitionsForJiraIssue` for the ticket.
2. If a transition whose **target status name** matches `In Review` (case-insensitive) is available → use
   `transitionJiraIssue` with that id. Done.
3. Else move forward one step toward review — prefer a transition whose target is `Dev in Progress`
   (e.g. "Start Development"). Apply it, then **re-fetch** transitions and retry step 2.
4. If after reaching an in-progress status there is still no `In Review` transition, **stop walking**, leave
   the ticket where it is, and report it — do not force an unrelated status.

Then comment the resolution on the ticket with `addCommentToJiraIssue`:

> Resolved via bulk PR <a11y-engine bulk PR URL>[ + axe-core bulk PR URL]. Dependency bumped to <pkg>@<ver>.
> Published via `stack:publish-workflow`.

Observed transition map (verify at runtime — treat as a hint, not a constant):
`New Item —(Start Development)→ Dev in Progress —→ In Review`. Other available transitions from New Item:
Dev Ready→To Do, QA Ready→Testing, Blocked→Other Teams, Closed.

**Never** in `dry-run`: no transitions, no comments — just report what would happen.
