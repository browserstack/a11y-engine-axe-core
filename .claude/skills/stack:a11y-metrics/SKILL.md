---
name: stack:a11y-metrics
description: Query a11y-engine metrics (L0/L1/L2 dashboards + AT errors) from BigQuery. Use when the user asks about accessibility engine latency (percy exec, worker wait, dom capture, asset capture, a11y API, rule-level), error rates (success/failure/partial), engine run failures, scan type breakdowns (Type A/B1/B2/C/AI/Headings), Assisted Tests error rate, breach investigation, or group/user attribution. Triggers: "a11y engine p90/p99", "scan failure rate", "type c latency", "percy exec latency", "check errors per rule", "L0/L1/L2 breach", "AT error rate", "assisted tests health", "AT errors", "who is driving this error".
---

# a11y-engine Metrics Skill

All metrics live in **one table**: `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`. Do NOT query Percy/dom-forge/MySQL — the engine emits its own EDS measurements.

## Setup

Default: `bq query --project_id=browserstack-production --nouse_legacy_sql --format=csv`. Long queries: `bq query ... < /tmp/q.sql`. CSV output is ~½ the tokens of `pretty` — reformat to markdown tables when presenting to the user. Use `--format=pretty` only when the user explicitly asks for raw-looking output.

For large result sets (>100 rows, e.g. per-group daily time series), pipe to `/tmp/out.csv` and extract a summary with `head`/`awk` rather than reading the whole file back.

## Decision tree

| Question                                                                       | Reference                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **"Analyse L0" / any L0 health check**                                         | **`references/l0_full_workflow.md` — run ALL phases autonomously**     |
| **"Create / schedule a daily L0 routine"** (cloud routine, auto-post to Slack) | **`references/l0_routine.md` — assemble + create the cloud routine**   |
| **"Check L0 routine drift" / "is my routine up to date" / "sync the routine"** | **`references/l0_routine.md` Step 5 — manifest drift check + re-sync** |
| "Is this a known issue?" / error signatures                                    | `references/signatures.md` — check BEFORE root-causing                 |
| "P90/P99 of X latency?"                                                        | `references/schema.md` for field → standard UNNEST (see below)         |
| L1 status / E2E latency per product                                            | `references/l1_queries.md`                                             |
| L2 error buckets / messages                                                    | `references/l2_error_queries.md`                                       |
| Per-rule check_errors, rule latency                                            | `references/l2_rule_queries.md`                                        |
| Thresholds / investigation workflow                                            | `references/breach_thresholds.md`                                      |
| AT errors (Assisted Tests error-rate rise)                                     | `references/at_l0_queries.md`                                          |
| "Where is this event emitted?" (code)                                          | `references/eds_data_flow.md`                                          |
| LookML validation                                                              | `references/looker_views.md`                                           |

## L0 = full workflow, autonomous

Any L0 phrasing runs the bifurcated **L0 → L1 → L2** workflow from `l0_full_workflow.md`. Each phase block is self-contained: tables (with threshold + status columns) → findings → actions (JIRA-tracked, L0/L1 only) → done, before moving to the next phase. Status is **binary ✅ / 🔴 only** — no 🟡, no watchlist, anywhere in user-facing output. Each phase opens with its Looker dashboard link:

- L0: https://browserstack.looker.com/dashboards/2867
- L1: https://browserstack.looker.com/dashboards/2938
- L2: https://browserstack.looker.com/dashboards/2936
- AT errors (Assisted Tests): https://browserstack.looker.com/dashboards/2976

Phase order: **TL;DR → L0 (snapshot + findings + actions) → L1 (success-% table + findings + actions) → AT errors (Assisted Tests error-rate check) → L2 (error rates + detailed buckets + inner-error drill-down + findings; no auto-tickets) → Group attribution → Slack/Canvas (when asked)**. Do not pause between phases. Always consult `signatures.md` internally — but **never expose signature IDs (S1, S2, …) in user-facing output**; they're internal-only.

## Scheduled L0 cloud routine

When the user asks to **create / schedule a daily L0 routine**, **auto-post the L0 report to Slack**, or set up a **cloud routine / remote agent** for the daily report, follow `references/l0_routine.md`. It sets up a Claude Code cloud routine (CCR, via the `RemoteTrigger` tool) that runs this same L0 → L1 → AT errors → L2 → group-attribution workflow on a cron schedule and posts the report unattended.

The routine cannot load this skill (isolated sandbox, no PAT for the private harness package), so the SQL is **inlined into the routine prompt** — assembled at creation time from the canonical query files in `references/` so the routine matches local execution. The routine runs BigQuery + Slack via MCP (no `bq`/JIRA CLI), and writes `Ticket needed: …` on a breach instead of filing JIRA (no Atlassian connector by default).

Because the inlined SQL is a point-in-time copy, the routine prompt carries a manifest of source-file SHAs. When the user asks to **check / sync the routine** — or after you edit any inlined reference file while a routine exists — run the Step 5 drift check in `references/l0_routine.md` (re-hash the references, confirm with a targeted SQL diff, then `RemoteTrigger update` only on real drift).

## AT errors (Assisted Tests) — peer to scanner L0/L1

Separate product surface (`product.name = 'ASSISTED_TESTS'`). Current scope is single-metric: flag rise in non-timeout error rate. Run AT errors on every full L0 workflow. Details, query, breach formula, and reporting format in `references/at_l0_queries.md`. Breach formula: today's `non_timeout_error_percentage` > (7-day median + 2pp) **OR** > 2× 7-day median. Low-volume modifier: when `total_runs < 0.3 × prior 7-day median`, **always still report the numbers** — but demote 🔴 to ⚠️ with wording like "elevated error rate, but volume is low — errors may be discounted". The breach check is never skipped silently. Timeouts are user-driven idle abandonment — informational, never breach. AT errors gets one extra status line in the combined Slack message (`✅/🔴/⚠️ AT errors`), one TL;DR line in the canvas peer to L0/L1, and one section in the canvas between L1 and L2. JIRA auto-files only on full 🔴, not on ⚠️. AT L1/L2 (per-check, completion, latency) are not in scope yet. **Never call this phase "AT L0" in user-facing output — always "AT errors".**

## CS track granularity (L0 splits, L1 combines)

`WEBSITE_SCANNER` is split via `product_metadata.prioritized` differently depending on the surface:

- **L0 latency panels**: show **CS OnDemand only** (`prioritized = 'true'`). CS Background is internal-only — never show in any L0 panel. This matches the dashboard.
- **L1 success-% table**: combine OnDemand + Background into a **single "CS" row per scan type**. Computed as `SUM(success across both) / SUM(total across both)`. Do NOT split.
- **L2**: aggregate by `product.name = 'WEBSITE_SCANNER'` (no split needed at the error-bucket level).

UNNEST pattern when the split is needed: `LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.product_metadata, '$.arr')) AS product_metadata WITH OFFSET USING(OFFSET)`. `prioritized` is STRING not bool.

## L0 failure threshold: > 3%

## Scan types (`kind.type`)

`SCAN_RUN`=A, `ADVANCE_SCAN_RUN`=B1, `ADVANCE_SCAN_RUN_WORKER`=B2, `ADVANCE_SCAN_RUN_DOMFORGE`=C, `ADVANCE_SCAN_RUN_AI`=AI, `POSTPROCESS_AI_HTML_WORKER`=Headings AI, `PREPROCESS_AI_HTML_WORKER`=Pre-AI HTML, `ASSET_CAPTURE`=Asset Cap, `UPTIME_METRIC_COLLECTION`=Uptime. Full emit-point mapping: `references/eds_data_flow.md`.

## Latency fields (inside `latency.arr[]`)

`a11y_engine_scan` (all), `worker_latency` (B1/B2/C/AI), `percy_exec_latency` (C only), `totalTimeWithAssetUploading` (C/AssetCap), `dataCollectionLatencyWithAck` (B1), `domCaptureTime`/`resourceCaptureTime` (C), `a11y_api_latency`, `type_<X>_worker_wait_time`, `type_<X>_worker_queue_size`, `rules.<rule>.rule_<rule>` (B2 per-rule).

## Standard UNNEST pattern

Nested arrays stored as `{arr:[...]}`. Join positionally via `WITH OFFSET USING(OFFSET)`:

```sql
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` AS stats,
  UNNEST(JSON_EXTRACT_ARRAY(stats.data, '$.arr')) AS data WITH OFFSET
  JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
  LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.latency, '$.arr')) AS latency WITH OFFSET USING(OFFSET)
```

Full field shapes: `references/schema.md`.

## Mandatory filters

1. `_PARTITIONTIME` filter (7-day default)
2. Exclude internal: `stats.user.group_id NOT IN (2,1033726,3704971,4554271,5487005,6144900,6147012,6492988,6649924,6654525,6677773,6682333,6702515,8375933,9206715,9643879,10018759,10706572) OR stats.user.group_id IS NULL`
3. No `SELECT *`
4. `SAFE_CAST` for JSON numbers
5. `APPROX_QUANTILES(x, 100)[OFFSET(90/95/99)]` for percentiles

**Keep this list in sync with the Looker dashboard filters.** Canonical list: `references/schema.md` § Internal Group IDs to Exclude. On drift (a dashboard suppresses a group the skill still counts → a breach the dashboard doesn't show), update the skill to match, **raise a PR, and share its link with the person who ran the skill.** (`9643879` = `bs-a11y-checks` synthetic monitor; added 2026-06-22 for parity.)

## Output rules

- State BQ fields read before each phase (transparency).
- For percentiles, emit P50/P90/P95/P99 together for distribution context.
- For attribution: show BOTH top-by-volume AND top-by-tail (usually different groups).
- Round latencies to ms; humanize durations > 5min ("~4m 19s").
- End every multi-phase run with a `### Learnings for memory (save if useful)` block (2–4 bullets, novel findings only).
- **Binary status only — never 🟡.** Every status column in every table (L0 / L1 / L2) is ✅ or 🔴. The 80–100%-of-threshold "watchlist" / "warning" band is internal-only context — never surface it. No "monitor tomorrow", no "near threshold" lines anywhere user-facing.
- **Bifurcated structure: L0 → L1 → L2.** Canvas + in-chat report block by phase; each phase is self-contained (Looker link → tables → `### Lx Findings` → `### Lx Actions`). Don't interleave phases.
- **L2 is NOT pass/fail.** L2 has no breach concept — it's an error overview surface (what errors are being emitted, where, in which product). Never write `✅ L2 — No breach` or `🔴 L2 — Breach`, never assign an L2 threshold, never ✅/🔴 score L2. L0 and L1 are the only binary phases.
- **Threshold column on L0 + L1 status surfaces only.** L0 has explicit thresholds per panel (failures > 3%, latency P90 ceilings). L1 threshold = 95% success (binary). L2 has no threshold column anywhere — it's reported as raw error rates and bucket breakdowns for context.
- **L0 output mirrors the dashboard panels**: Engine Run Failures, AUT P90 (Client Side), CS OnDemand P90, WA P90. CS OnDemand only — no CS Background, no combined CS, in L0.
- **Canvas: L0/L1 phase blocks are breach-only — no status tables even with all-✅ rows.** When clean, render exactly `✅ **<Phase> — No breach**` + `### Lx Findings` + `### Lx Actions`. When breached, render only the 🔴 row(s) as bullets with value + threshold + status. **L2 is not pass/fail** — render the L2 section as `## L2 — Error overview` (no `✅`/`🔴` line, no breach status), then the relevant error-bucket sub-sections (ASSET_CAPTURE always; top error messages + inner-error drill-down when L1 breached). The canvas TL;DR carries all narrative context (latency P90s, top failure groups, L2 top error sources) so phase blocks stay lean.
- **Slack message = pure one-liners + canvas link.** ONE message containing exactly one line per phase (L0, L1, AT errors) + the canvas link at the bottom — never split across messages. NO numbers, percentages, run counts, top groups, top drivers, or breach details inline. All numeric context belongs in the canvas. Line format per phase: `<emoji> <Phase> — <status> ([Looker dashboard](URL))`. Statuses: `No breach` (✅), `Breach` (🔴). AT errors additionally supports `Elevated, low volume` (⚠️) when the breach formula tripped but `today_runs < 0.3 × prior 7-day median`. No L2 line in Slack — L2 is informational and lives only in the canvas. Do NOT omit any clean phase block. Example clean-day Slack message (5 lines total — title + 3 phase lines + canvas link):
  ```
  *a11y-engine daily report — {date}*
  ✅ L0 — No breach (<Looker dashboard|https://browserstack.looker.com/dashboards/2867>)
  ✅ L1 — No breach (<Looker dashboard|https://browserstack.looker.com/dashboards/2938>)
  ✅ AT errors — No breach (<Looker dashboard|https://browserstack.looker.com/dashboards/2976>)
  Canvas: <canvas_url|Full report>
  ```
  Posting order: create canvas FIRST via `slack_create_canvas`, capture the URL, then post the single combined message via `slack_send_message`.
- **L1 shows one combined "CS" row per scan type** (OnDemand + Background folded together), plus AUT and WA. Every row scored ✅ or 🔴 against the 95% threshold. **Always count by `COUNT(DISTINCT kind.uuid)`** — AI scan types emit ~30 EDS rows per scan; row-counting inflates AI by 30× and misreports breaches. Take the worst status across all rows for the same uuid (FAILURE > PARTIAL > SUCCESS).
- **TL;DR is the canvas's narrative surface.** L0 line: ✅/🔴 + failure rate vs threshold + closest-to-ceiling latency panel. L1 line: ✅/🔴 + lowest success-% rows when clean, breach bullets when not. AT errors line: ✅/🔴/⚠️ + non-timeout error % vs 7-day median, with low-volume note when applicable (wording from `at_l0_queries.md` "Canvas TL;DR line"). L2 line: NO ✅/🔴 status (L2 isn't pass/fail) — surface as `**L2 (error overview, not pass/fail)**` followed by top error sources + rates. Plus latency-headroom note + customer-concentration note + Actions. The Slack message gets only L0/L1/AT-errors one-liner status; the canvas TL;DR carries the day's full picture including L2 informational summary.
- **Canvas L2 = error buckets only.** No Error Rate by Scan Type table. ASSET_CAPTURE Error Buckets always renders (most common L2 surface). Top Error Messages + inner-error drill-down render only when an L1 breach needs root-causing. B1 debug_errors and check_errors usually omit on a clean day.
- **L2 main "Top Error Messages" table excludes ASSET_CAPTURE rows and B1 `debug_errors` rows**; surface those in dedicated sub-sections.
- **Top Failure Groups table has 6 columns**: group_id, Product, Scan Type, Failures, Total Scans, Failure %. Same `COUNT(DISTINCT uuid)` deduping as L1 — never row-count. % column is mandatory; readers need to distinguish 100% on a 14-scan fleet from 12% on 2,742 scans. Always render this table — gives reader customer-attribution context regardless of breach status.
- **When a single error message dominates a bucket**, run the Phase 4c inner-error drill-down (unnest `.error`). The B1 "Runtime Error while collecting data for type B" bucket is no longer opaque — `.error` is populated.
- **JIRA tickets only for L0 and L1 breaches.** L2 errors do NOT auto-create tickets — if an L2 error driver is the root cause of an L0/L1 breach, the ticket attaches at the L0/L1 breach (in its `### Lx Actions` table). Search JIRA before creating; create with explicit priority (P0/P1/P2) and assign to a real owner (default: assign to the user, mirroring AXE-3315 convention). On AXE Stories, set custom fields `customfield_10103: "Ops: Other Tasks"` and `customfield_10104: "Engineering"` (both required by AXE project workflow).
- **Slack formatting**: never `---` (breaks `invalid_blocks`); under ~5,000 chars; markdown tables don't render aligned in Slack messages — use fenced code blocks for monospace alignment.
- **Canvas formatting**: never include `# title` (auto-prepended); avoid `* footnote` at line-start (renders as a bullet); markdown tables DO render correctly in canvas.
