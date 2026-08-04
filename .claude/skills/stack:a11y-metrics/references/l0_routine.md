# Scheduled L0 Cloud Routine

**When to use:** the user asks to "create / schedule a daily L0 routine", "cloud routine for L0", "auto-post the L0 health check to Slack every morning", "remote agent for the daily report", or similar. This sets up a **Claude Code cloud routine** (remote agent, CCR) that runs the full L0 → L1 → AT errors → L2 → group-attribution workflow on a cron schedule and posts the report to Slack — unattended.

This reference describes how to **assemble and create** that routine. The routine itself runs the same analysis as `l0_full_workflow.md` — the only differences are the execution surface (remote sandbox, MCP tools instead of the `bq`/JIRA CLIs) and that the SQL must be **inlined into the routine prompt** (see "Why inline" below).

---

## Why inline — the routine cannot load this skill

A cloud routine runs in an isolated Anthropic sandbox. It does **not** have the harness skills installed, and it cannot install them at run time:

- `npx @browserstack/ai-harness init` pulls a **private** GitHub Packages package (`@browserstack` scope on `npm.pkg.github.com`) that needs a GitHub PAT with `read:packages`.
- That PAT **must never be placed in the routine prompt** — the prompt is stored in the routine body and echoed in every run transcript (secret-in-plaintext leak). There is no supported per-routine secret/env injection for it.

Therefore the routine prompt must be **self-contained**: the agent that _creates_ the routine (you, running locally with this skill installed) reads the canonical query files in this directory and **pastes the SQL verbatim** into the routine's event message. The created routine then matches local execution without ever needing the skill or a PAT.

> **Single source of truth:** do not maintain a second copy of the queries here. Always inline the _current_ SQL from the sibling reference files at creation time. When those files change, re-create (or update) the routine to pick up the new SQL — see "Keeping the routine in sync".

## Execution-surface deltas vs. running locally

The assembled prompt must override four things from the local workflow, because the sandbox differs:

1. **BigQuery via MCP, not the `bq` CLI.** There is no `bq` binary in the sandbox. Instruct the agent to run every query through the Google Cloud BigQuery MCP tool (prefer `execute_sql_readonly`). Ignore all `bq query …` CLI phrasing in the inlined references.
2. **Slack via MCP.** Posting uses the Slack MCP tools (`slack_create_canvas`, `slack_send_message`), exactly as `l0_full_workflow.md` Phase 8 describes.
3. **No JIRA by default.** The routine has no Atlassian connector (don't add one unless the user asks). On an L0/L1/AT breach, the agent must write `Ticket needed: <one-line description>` in the Actions section instead of creating a ticket.
4. **Report date = previous full UTC day.** The routine has no human in the loop to say "yesterday", so state it explicitly: report date = `CURRENT_DATE - 1` (UTC); use it in the title `a11y-engine L0 Health Check — YYYY-MM-DD`. The latency panels still use the week-to-date Monday window per `l0_full_workflow.md` Phase 1b.

Everything else — windows, internal-group exclusion lists, thresholds, `COUNT(DISTINCT uuid)` deduping, binary ✅/🔴, signature recognition, breach-only canvas/Slack format — is identical to local and comes straight from the inlined references.

---

## Step 1 — Gather inputs from the user

Ask (or confirm) before creating:

| Input                    | Default / note                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slack destination**    | Channel ID (e.g. `C07BHSNDDCG`). Ask whether to **reply in the thread** of a recurring workflow message (give the workflow/bot post pattern + its approx time) or **post top-level**.                      |
| **Schedule (cron, UTC)** | Min interval 1h. The user's times are local — convert and confirm (e.g. 10:45 IST = `15 5 * * *`). If replying in a workflow thread, fire a few minutes **after** the workflow posts so the thread exists. |
| **Model**                | `claude-sonnet-4-6` default.                                                                                                                                                                               |
| **Connectors**           | Google Cloud BigQuery + Slack (both required, per-account). If either isn't connected on the caller's account, stop and point them to https://claude.ai/customize/connectors.                              |
| **Environment**          | The CCR environment id (e.g. the default `anthropic_cloud` environment).                                                                                                                                   |

## Step 2 — Assemble the routine prompt

Build the event `message.content` by concatenating the blocks below **in order**. Where a slot says _INLINE_, open the named file and paste the SQL/rules verbatim (fenced) into the routine prompt:

1. **Header** — identity + autonomy + the four execution-surface deltas above. Template:
   > You are the daily L0 health-check agent for BrowserStack's a11y-engine (Spectra). Work fully autonomously — never pause to ask. Report date = previous full UTC day; title `a11y-engine L0 Health Check — YYYY-MM-DD`. Run ALL SQL through the Google Cloud BigQuery MCP tool (prefer execute_sql_readonly) — there is no `bq` CLI here; ignore any `bq query` phrasing below. Post via the Slack MCP tools. You have no Atlassian connector — on any breach write `Ticket needed: <desc>` instead of creating a JIRA ticket.
2. **Phase 1a — Engine Run Failures** — _INLINE_ the `### 1a` query from `l0_full_workflow.md`, plus the `> 3%` daily threshold.
3. **Phase 1b — Latency P90 per track (week-to-date)** — _INLINE_ the `### 1b` query from `l0_full_workflow.md`, plus the Phase 1c threshold table. Note: CS thresholds = OnDemand only; never show CS Background.
4. **Phase 2 — L1 success-% + E2E latency** — _INLINE_ both queries (status distribution + E2E P90) from `l1_queries.md`. Breach = success < 95% (binary), `COUNT(DISTINCT uuid)`, worst-status-per-uuid; CS folded into one row per scan type for the success table.
5. **Phase AT errors** — _INLINE_ the 7-day series query + breach formula + status-resolution table from `at_l0_queries.md`. Label "AT errors" (never "AT L0").
6. **Phase 3/4 — L2 error overview** _(run only when L0 or L1 breached; L2 is never pass/fail)_ — _INLINE_ the Error Summary query, the two JS UDFs (`extractErrorArray`, `normalize_error_message`), the detailed bucket template + the `{KIND_FILTER}` list from `l2_error_queries.md`. Plus the check_errors JS-UDF pattern and the Phase 4c inner-error drill-down from `l0_full_workflow.md`. Carry the bucket exclusions (ASSET_CAPTURE + B1 `debug_errors` out of the main table).
7. **Phase 5 — Group attribution** — _INLINE_ the Phase 5a/5b patterns from `l0_full_workflow.md` (per `(group_id, product, scan_type)`: Failures, Total Scans, Failure %; same DISTINCT-uuid dedupe).
8. **Signature awareness** — _INLINE_ a condensed list of the current signatures from `signatures.md` so the agent can dismiss/recognise known noise (never expose signature IDs in output).
9. **Output protocol** — _INLINE_ the Slack + canvas rules from `l0_full_workflow.md` Phase 6 & 8 and the Output rules in `SKILL.md`: fresh canvas per run; breach-only phase blocks; binary ✅/🔴 (no 🟡); L2 never pass/fail; one combined Slack message (L0 + L1 + AT-errors one-liners + canvas link); `Ticket needed:` instead of JIRA; Slack gotchas (no `---`, < 5000 chars, fenced code for tables). Add the destination specifics from Step 1 (channel id; reply-in-workflow-thread vs top-level, with the "if the workflow message isn't found, post top-level with a note" fallback).

Keep each inlined SQL block fenced and unaltered — the only edits allowed are the four execution-surface deltas, never the query logic, windows, or exclusion lists.

10. **Manifest marker** _(required — enables the drift check in Step 5)_ — append, as the **last line** of the prompt, an HTML comment listing the source files inlined above with their current blob SHAs:

    ```
    <!-- l0-routine-manifest: l0_full_workflow.md@<sha>, l1_queries.md@<sha>, at_l0_queries.md@<sha>, l2_error_queries.md@<sha>, breach_thresholds.md@<sha>, signatures.md@<sha> -->
    ```

    Compute each `<sha>` with `git hash-object references/<file>` (short form, e.g. first 12 chars) run from the skill directory. The comment is inert to the agent at run time but lets a later drift check tell which sources have moved since the routine was built. List every file you actually inlined from.

## Step 3 — Create the routine

Use the `RemoteTrigger` tool, `action: "create"`, `enabled: true`. Generate a fresh lowercase v4 UUID for the event uuid. Body shape:

```json
{
  "name": "a11y-engine Daily L0 Health Check",
  "cron_expression": "<from Step 1>",
  "enabled": true,
  "mcp_connections": [
    {
      "connector_uuid": "<BigQuery connector uuid>",
      "name": "Google-Cloud-BigQuery",
      "url": "https://bigquery.googleapis.com/mcp"
    },
    {
      "connector_uuid": "<Slack connector uuid>",
      "name": "Slack",
      "url": "https://mcp.slack.com/mcp"
    }
  ],
  "job_config": {
    "ccr": {
      "environment_id": "<environment id>",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "allowed_tools": [
          "Bash",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "ToolSearch"
        ]
      },
      "events": [
        {
          "data": {
            "uuid": "<fresh lowercase v4 uuid>",
            "session_id": "",
            "type": "user",
            "parent_tool_use_id": null,
            "message": {
              "role": "user",
              "content": "<assembled prompt from Step 2>"
            }
          }
        }
      ]
    }
  }
}
```

No git repo source is needed — the prompt is self-contained.

## Step 4 — Verify

1. Trigger one immediate run (`RemoteTrigger` `action: "run"`). Watch the run transcript at `https://claude.ai/code/routines/{id}`.
2. Confirm: BigQuery MCP authenticated, the Slack canvas was created, and the combined message landed in the right channel/thread.
3. Relay the routine URL to the user.

Run logs live only in the web UI (routine page → per-run transcript). There is no local log file — the routine runs in the cloud.

## Step 5 — Drift check & re-sync

The inlined SQL is a point-in-time copy, so a routine drifts when the reference files it was built from change. Run this when the user asks to **"check L0 routine drift"**, **"is my L0 routine up to date"**, or **"sync the L0 routine"** — and proactively at the end of any session where you edited one of the inlined reference files while a routine exists.

Two layers — cheap detection, then precise confirmation:

1. **Detect (manifest).** `RemoteTrigger` `action: "get"` the routine, read the trailing `<!-- l0-routine-manifest: … -->` comment from the event prompt, and re-hash the current reference files with `git hash-object references/<file>`. Any SHA that differs (or a file present today but missing from the manifest) is a **candidate drift**.
   - If the routine has **no manifest** (created before this convention), treat it as fully stale → go straight to re-sync.
2. **Confirm (targeted diff).** For each candidate file, re-assemble just the block(s) it feeds (per Step 2) and diff against the corresponding fenced SQL in the live prompt, normalising whitespace. This filters false positives — a reference can change in a section the routine doesn't inline. Report per block: `unchanged` / `drifted` / `missing`.
3. **Re-sync (on confirmed drift).** Re-assemble the full prompt (Step 2, including a fresh manifest with updated SHAs) and `RemoteTrigger` `action: "update"` the routine body. Keep the same cron, connectors, and uuid unless the user asks to change them. Show the user the per-block drift summary before updating, then confirm the update and relay the routine URL.

If the manifest matches on every file, report "routine is in sync — no update needed" and stop. Do not re-create on a clean check.

> The manifest is intentionally conservative: it flags a file-level change even if the inlined section is untouched. Layer 2 is what decides whether an actual update is warranted, so never `update` on a Layer-1 hit alone.

## Connector / permission notes (tell the user)

- BigQuery + Slack connectors are **per-account** — whoever owns the routine must have both connected; their BigQuery identity needs read access to `browserstack-production.a11y_engine`, and their Slack identity must be able to post + create canvases in the target channel.
- Minimum cron interval is 1 hour. Cron is UTC.
- You **cannot delete** a routine via the API — direct the user to https://claude.ai/code/routines.
