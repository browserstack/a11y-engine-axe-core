---
name: stack:debug-alert
description: "Read-only on-call triage for a11y-engine Zenduty alerts (#team-a11y-engine-zenduty-notifications). Parses the alert, classifies the a11y-engine lane, runs deploy/metrics/errors probes, and posts a structured analysis to the alert thread. Diagnostic only — never remediates. Use when an alert fires and you want a first-pass analysis. Triggers: 'debug this alert', 'triage incident', 'what happened with this zenduty alert'."
argument-hint: '<slack-thread-url|channel-id ts> [--dry-run] [--force]'
allowed-tools:
  [
    Read,
    Glob,
    Grep,
    Bash(git log:*),
    Bash(git diff:*),
    Agent,
    Skill,
    mcp__claude_ai_Slack__slack_read_thread,
    mcp__claude_ai_Slack__slack_read_channel,
    mcp__claude_ai_Slack__slack_send_message
  ]
---

# Skill: stack:debug-alert — a11y-engine on-call triage

## What this is

A **read-only** first-pass debugger for Zenduty incidents in
`#team-a11y-engine-zenduty-notifications` (channel `C09CRHZMTT9`). You parse the alert, classify
the a11y-engine lane, dispatch read-only probes, and post one structured triage card to the
thread. **You never remediate** — resolving the incident is the human's job. Your only write is the
single Slack reply.

## When to invoke

`/stack:debug-alert <slack-thread-url> [--dry-run] [--force]` — when an alert fires and the
on-call wants correlated context fast. `--dry-run` prints the card to terminal and posts nothing.
`--force` re-triages a thread that already has a triage reply.

## Step 1 — Resolve the thread and parse the alert

1. Parse `$ARGUMENTS`:
   - A Slack permalink `…/archives/<CID>/p<digits>` → `channel_id=<CID>`; `message_ts` = the
     digits after `p` with a `.` inserted before the last 6 digits
     (e.g. `p1780983850123456` → `1780983850.123456`).
   - `<channel-id> <ts>` → use directly.
   - bare `<ts>` → `channel_id = C09CRHZMTT9`.
   - empty → print `Usage: /stack:debug-alert <slack-thread-url> [--dry-run] [--force]` and STOP.
   - Detect `--dry-run` and `--force` anywhere in `$ARGUMENTS`.
2. `slack_read_thread(channel_id, message_ts)` — read the parent message and existing replies.
3. Validate it is a Zenduty alert: author is "Xurrent IMR (Zenduty)" AND the text matches
   `New incident #<id> <triggered|acknowledged|resolved> !`. If not, print
   `Not a Zenduty alert thread — nothing to triage.` and STOP (post nothing).
4. Parse into a record:
   - `incident_id`, `status`, `source` (`HoneyComb`|`Prometheus`|`Nagios`), `alert_name`,
     `description`, `current_value`, `threshold`, `priority`, `urgency`,
     `created_at`, `resolved_at` (UTC), `tags`, and any embedded links / labels
     (`zenduty_url`, `honeycomb_url`, `runbook_url`, `dashboard`, `pod`, `deployment`, `queue`,
     `host`). Compute `window = { start: created_at − 30m, end: resolved_at || now }`.
5. Classify `lane` from `source` + `alert_name`:

   | Lane         | Match                                                             |
   | ------------ | ----------------------------------------------------------------- |
   | latency      | HoneyComb; `latency`/`after_job`/`percy`/`DomForge`/Type C        |
   | failure-rate | Prometheus; `DownTimeHighFailureRate` / run failure rate          |
   | 5xx          | Prometheus; `NGINXTooMany500s` / 5XX                              |
   | queue        | Prometheus; `P*JobFailure` / BullMQ / a queue name present        |
   | k8s          | Prometheus; `ContainerRestarts` / `Available Replicas Decreased`  |
   | rate-limit   | Nagios; `check_elk_data` / 429                                    |
   | unknown      | no match (run deploy-correlation + errors only; echo raw message) |

6. **Idempotency:** if any existing reply contains `⟨triage:#<incident_id>⟩`, print
   `Already triaged incident #<id> (see thread).` and STOP — unless `--force` was passed.

## Step 2 — Dispatch read-only probes in parallel

Decide the probe set for the lane:

- every lane → `deploy-correlation`
- every lane except `unknown` → `metrics`
- `5xx`, `queue`, `k8s`, `failure-rate`, `unknown` → `errors`
- `latency` → `errors` **only when the alert is HoneyComb-sourced** (so the agent runs its Honeycomb
  error-signal step against the dataset in `alert.honeycomb_url` — Percy-side `after_job`/DomForge
  failures emit a Honeycomb span but often never reach Sentry). Skip `errors` for latency otherwise.

Dispatch each probe **in parallel** — issue all `Agent` calls in a SINGLE message — using
`subagent_type: stack:incident-investigator`. Pass each one a brief:

```
probe: <deploy-correlation|metrics|errors>
lane: <lane>
alert: <the parsed record as compact JSON>
window: <{start,end} UTC>
```

Collect each agent's returned findings block. If an agent errors or returns nothing, keep a
`⚠️ <probe> errored` note and continue — never abort the whole run for one probe.

## Step 3 — Compose the triage card

Aggregate the probe findings into this exact card (omit a line only if truly N/A):

```
🔎 *What fired* — incident #<id> · <source>/<alert_name> · <priority>
Current <current_value> vs threshold <threshold>. Window <created_at>–<resolved_at|ongoing>.
Status now: <triggered|acknowledged|resolved (after Xs)>.

🧪 *What I checked* — deploy-correlation · <lane> metrics (HootHoot/BQ/Honeycomb) · errors (Sentry/Honeycomb)
<note any source that was unavailable>

📊 *What I found*
• Deploy: <deploy y/n + job/build + PR(s), or "no deploy in window">
• Metric: <breaching signal value + trend; which scan-type/queue/pod/route/group. For HoneyComb-sourced alerts, the value confirmed directly in Honeycomb>
• Errors: <Sentry issue(s) + Honeycomb error-span spike with counts, or "no correlated spike">
• 👥 Top group: <the single group driving the most errors/latency + its share (from the probes' `top_group`), or "broad: no single group">

🧭 *Likely cause(s)* (ranked)
1. <named cause> — confidence High/Med/Low — ref ERROR-CATALOG <section>/<file>
2. ...

✅ *Next steps for the human* (you decide & act — this bot does not)
• <diagnostic/remediation pointer>
• <runbook link if present>

🔗 *Links* — Zenduty <url> · <Honeycomb/HootHoot> · <runbook> · Sentry <url> · PR <url>

Confidence: <HIGH|MEDIUM|LOW>
⟨triage:#<incident_id>⟩
🤖 Automated read-only diagnostic by Claude (/stack:debug-alert). No changes were made. Verify before acting.
```

Confidence: **HIGH** if a deploy is in-window and/or a Sentry spike clearly correlates and/or the
metric pins a single scan-type/queue/pod; **MEDIUM** for partial correlation; **LOW** if nothing
correlates (likely a transient flap — say so).

For an already-`resolved` flap with no correlated signal, keep the card short: note
"resolved after Xs, likely transient" and `Confidence: LOW`.

## Step 4 — Post (or print on --dry-run)

- If `--dry-run`: print the full card to the terminal and STOP. Post nothing.
- Else: `slack_send_message(channel_id, thread_ts=<parent message_ts>, text=<card>)`. On success,
  print the thread permalink. On failure, print the raw error AND the full card to the terminal,
  then STOP — do not retry.

## Hard rules

- You only ever call the read tools above plus the ONE `slack_send_message`. You never trigger a
  build, restart a pod, edit code/config, transition Jira, or approve Percy. The investigator
  agent is `allowed-tools`-restricted to read-only for the same reason.
- Always include the `⟨triage:#…⟩` marker and the disclaimer footer in the posted card.
