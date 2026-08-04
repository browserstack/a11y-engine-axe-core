# L0 Full Investigation Workflow (L0 → L1 → L2 → Groups → RCA)

**When to use:** user says "analyse L0", "yesterday's L0", "check today's L0", "L0 breach investigation", or any phrasing that asks for a health snapshot of the a11y-engine. Execute **all phases autonomously in one go** — do not stop and ask between phases.

## Product tracks (CS handling differs by phase)

`WEBSITE_SCANNER` is split via `product_metadata.prioritized` differently depending on the phase:

- **L0 latency panels** — show **CS OnDemand only** (`product_metadata.prioritized = 'true'`). CS Background is internal-only — never show in L0 output. This matches the dashboard.
- **L1 success-% table** — fold OnDemand + Background into a **single "CS" row per scan type**. Computed as `SUM(success across both subsets) / SUM(total across both subsets)`. Do NOT split.
- **L2** — aggregate by `product.name = 'WEBSITE_SCANNER'` (no split needed at the error-bucket level).

AUT and WA remain single tracks throughout.

**Looker dashboards (cite at the top of each phase block):**

- L0: https://browserstack.looker.com/dashboards/2867
- L1: https://browserstack.looker.com/dashboards/2938
- L2: https://browserstack.looker.com/dashboards/2936

## Before you run queries

State briefly which BigQuery fields are being read for each phase. Example:

> **Phase 1 queries**: `kind.arr[].type`, `data.arr[].uuid`, `data.arr[].status`, `latency.arr[].a11y_engine_scan`, `latency.arr[].totalTimeWithAssetUploading`, `latency.arr[].dataCollectionLatencyWithAck`, `product.arr[].name`, `product_metadata.arr[].prioritized`, `user.group_id`, `errors.arr[]` (for failure filter), `_PARTITIONTIME`, `created_at`.

Users need to know what's being accessed — this is a transparency rule, not optional.

---

## Phase 1 — L0 snapshot

**Windows differ per panel — do not unify them:**

- **Engine Run Failures (Phase 1a):** previous full UTC day (yesterday). Single-day failure-rate check.
- **Latency P90 panels — AUT, CS OnDemand, WA (Phase 1b):** current week starting Monday → "now" (week-to-date). The L0 Looker dashboard groups these by `Scan Week (starting Monday)`; for today (2026-05-14, a Thursday) the active row is `2026-05-11`. Always label the latency window in user-facing output (e.g. "Week of 2026-05-11 → 2026-05-14"); the failures line stays day-scoped (e.g. "2026-05-13").

L1/L2 windows are scoped separately — do not assume they share either Phase 1a or 1b's window.

### 1a. Engine Run Failures (single day — yesterday)

**Threshold: > 3% is a breach.**

```sql
SELECT
  DATE(s.created_at) AS date,
  COUNT(DISTINCT CASE
    WHEN JSON_EXTRACT_SCALAR(data, '$.status') = 'FAILURE'
      AND NOT (
        (JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN' AND TO_JSON_STRING(errors) LIKE '%A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received%')
        OR (JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN' AND TO_JSON_STRING(errors) LIKE '%Data collection error from previous run%')
        OR (JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN_DOMFORGE' AND TO_JSON_STRING(errors) LIKE '%A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received%')
      )
    THEN JSON_EXTRACT_SCALAR(kind, '$.uuid')
  END) AS failures,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(data, '$.uuid')) AS total_scans
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` s,
  UNNEST(JSON_EXTRACT_ARRAY(s.data, '$.arr')) AS data WITH OFFSET
  LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(s.errors, '$.arr')) AS errors WITH OFFSET USING(OFFSET)
  JOIN UNNEST(JSON_EXTRACT_ARRAY(s.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
WHERE s._PARTITIONTIME >= TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 2 DAY)
  AND s._PARTITIONTIME < TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)
  AND s.created_at >= TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 DAY)
  AND s.created_at < TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY)
  AND (s.user.group_id NOT IN (2,1033726,3704971,4554271,5487005,6144900,6147012,6492988,6649924,6654525,6677773,6682333,6702515,8375933,9206715,9643879,10018759,10706572) OR s.user.group_id IS NULL)
  AND JSON_EXTRACT_SCALAR(kind, '$.type') IN ('ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_AI','ADVANCE_SCAN_RUN_DOMFORGE','ADVANCE_SCAN_RUN_WORKER','POSTPROCESS_AI_HTML_WORKER','SCAN_RUN')
GROUP BY 1
```

### 1b. Latency P90 per product track (week-to-date)

Splits CS into OnDemand vs Background via `product_metadata.prioritized`. CS L0 threshold applies to **OnDemand only**; Background is reported for context.

```sql
WITH filtered_base AS (
  SELECT a.created_at, a.user.group_id, a.data, a.latency, a.kind, a.product, a.product_metadata
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` a
  WHERE _PARTITIONTIME >= TIMESTAMP_SUB(TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY))), INTERVAL 1 DAY)
    AND _PARTITIONTIME < CURRENT_TIMESTAMP()
    AND a.created_at >= TIMESTAMP(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)))
    AND a.created_at < CURRENT_TIMESTAMP()
    AND NOT (user.group_id IN (2,6147012,8375933,1033726,6649924,6144900,4554271,6702515,5487005,6677773,6654525,3704971,6682333,6492988,9206715,9643879,10018759,10706572))
    AND JSON_EXTRACT_ARRAY(a.kind, '$.arr') IS NOT NULL
    AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(a.kind, '$.arr')) > 0
),
base_scans AS (
  SELECT
    JSON_EXTRACT_SCALAR(kind, '$.type') AS scan_type,
    JSON_EXTRACT_SCALAR(product, '$.name') AS product_name,
    JSON_EXTRACT_SCALAR(product_metadata, '$.prioritized') AS prioritized,
    JSON_EXTRACT_SCALAR(kind, '$.uuid') AS scan_uuid,
    CASE
      WHEN JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN_DOMFORGE'
        THEN SAFE_CAST(JSON_EXTRACT_SCALAR(latency, '$.a11y_engine_scan') AS FLOAT64)
           + SAFE_CAST(JSON_EXTRACT_SCALAR(latency, '$.totalTimeWithAssetUploading') AS FLOAT64)
      WHEN JSON_EXTRACT_SCALAR(kind, '$.type') IN ('ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_AI','SCAN_RUN')
        THEN SAFE_CAST(JSON_EXTRACT_SCALAR(latency, '$.a11y_engine_scan') AS FLOAT64)
    END AS computed_latency,
    CASE WHEN JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN'
      THEN SAFE_CAST(JSON_EXTRACT_SCALAR(latency, '$.dataCollectionLatencyWithAck') AS FLOAT64) END AS data_collection_latency,
    CASE WHEN JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN_DOMFORGE'
      THEN SAFE_CAST(JSON_EXTRACT_SCALAR(latency, '$.totalTimeWithAssetUploading') AS FLOAT64) END AS asset_capture_latency
  FROM filtered_base fb,
    UNNEST(JSON_EXTRACT_ARRAY(fb.data, '$.arr')) AS data WITH OFFSET AS d
    JOIN UNNEST(JSON_EXTRACT_ARRAY(fb.latency, '$.arr')) AS latency WITH OFFSET AS l ON d=l
    JOIN UNNEST(JSON_EXTRACT_ARRAY(fb.kind, '$.arr')) AS kind WITH OFFSET AS k ON d=k
    JOIN UNNEST(JSON_EXTRACT_ARRAY(fb.product, '$.arr')) AS product WITH OFFSET AS p ON d=p
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(fb.product_metadata, '$.arr')) AS product_metadata WITH OFFSET AS pm ON d=pm
  WHERE JSON_EXTRACT_SCALAR(kind, '$.type') IN ('SCAN_RUN','ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_DOMFORGE','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_AI','POSTPROCESS_AI_HTML_WORKER')
    AND JSON_EXTRACT_SCALAR(product, '$.name') IN ('WEBSITE_SCANNER','AUTOMATED_TESTS','WORKFLOW_ANALYSER')
    AND JSON_EXTRACT_SCALAR(kind, '$.uuid') IS NOT NULL
),
classified AS (
  SELECT
    CASE
      WHEN product_name = 'WEBSITE_SCANNER' AND prioritized = 'true' THEN 'CS OnDemand'
      WHEN product_name = 'WEBSITE_SCANNER' THEN 'CS Background'
      WHEN product_name = 'AUTOMATED_TESTS' THEN 'AUT'
      WHEN product_name = 'WORKFLOW_ANALYSER' THEN 'WA'
    END AS product_track,
    scan_type, scan_uuid, computed_latency, data_collection_latency, asset_capture_latency
  FROM base_scans
),
deduped AS (
  SELECT product_track, scan_type, scan_uuid,
    MAX(computed_latency) AS latency,
    MAX(data_collection_latency) AS data_collection_latency,
    MAX(asset_capture_latency) AS asset_capture_latency
  FROM classified
  GROUP BY 1,2,3
)
SELECT
  product_track,
  ROUND(APPROX_QUANTILES(CASE WHEN scan_type='SCAN_RUN' THEN latency END, 100)[OFFSET(90)], 0) AS type_a_p90,
  ROUND(APPROX_QUANTILES(CASE WHEN scan_type='ADVANCE_SCAN_RUN' THEN latency END, 100)[OFFSET(90)], 0) AS type_b1_p90,
  ROUND(APPROX_QUANTILES(CASE WHEN scan_type='ADVANCE_SCAN_RUN_DOMFORGE' THEN latency END, 100)[OFFSET(90)], 0) AS type_c_p90,
  ROUND(APPROX_QUANTILES(CASE WHEN scan_type='ADVANCE_SCAN_RUN_WORKER' THEN latency END, 100)[OFFSET(90)], 0) AS type_b2_p90,
  ROUND(APPROX_QUANTILES(CASE WHEN scan_type='ADVANCE_SCAN_RUN_AI' THEN latency END, 100)[OFFSET(90)], 0) AS type_ai_p90,
  ROUND(APPROX_QUANTILES(data_collection_latency, 100)[OFFSET(90)], 0) AS b_data_coll_p90,
  ROUND(APPROX_QUANTILES(asset_capture_latency, 100)[OFFSET(90)], 0) AS asset_capture_p90,
  COUNT(DISTINCT scan_uuid) AS total_scans
FROM deduped
GROUP BY product_track
ORDER BY product_track
```

The L0 dashboard ([L0] AllyEngine — Looker) has 4 panels you must mirror in user-facing output: **Engine Run Failures**, **AUT P90 (Client Side)**, **CS OnDemand P90**, **WA P90**. The query above produces all the values needed for the 3 latency panels:

- AUT panel columns: Type B Data Collection, Asset Capture, Type A
- CS OnDemand panel columns: Type A, Max(Type B1, C), Type B2, MAX(Type AI, Headings)
- WA panel columns: same as CS OnDemand

For `MAX(Type AI, Headings)` use `GREATEST(type_ai_p90, headings_ai_p90)`. Headings AI P90 from `POSTPROCESS_AI_HTML_WORKER` lives in `data.arr[].additionalData.a11yScanLatency` — query separately if needed (a clean day will have very few or zero `POSTPROCESS_AI_HTML_WORKER` events; report `—` rather than fudging).

### 1c. Apply thresholds

| Metric                                 | Threshold | Apply to                | Panel               |
| -------------------------------------- | --------- | ----------------------- | ------------------- |
| Engine Run Failure %                   | 3%        | All scan types combined | Engine Run Failures |
| Type A P90                             | 5,000ms   | Each product track      | AUT/CS OnDemand/WA  |
| AUT Asset Capture P90                  | 25,000ms  | AUT only                | AUT                 |
| AUT Type B Data Collection P90         | 14,000ms  | AUT only                | AUT                 |
| CS OnDemand Max(B1, C) P90             | 80,000ms  | CS OnDemand only        | CS OnDemand         |
| CS OnDemand Type B2 P90                | 80,000ms  | CS OnDemand only        | CS OnDemand         |
| CS OnDemand MAX(Type AI, Headings) P90 | 80,000ms  | CS OnDemand only        | CS OnDemand         |
| WA Max(B1, C) P90                      | 80,000ms  | WA only                 | WA                  |
| WA Type B2 P90                         | 80,000ms  | WA only                 | WA                  |
| WA MAX(Type AI, Headings) P90          | 80,000ms  | WA only                 | WA                  |

Status is **binary** — each metric is ✅ (within threshold) or 🔴 (over threshold). No 🟡, no watchlist band, anywhere in user-facing output.

| Status | Latency rule                                                                                                                | Engine Run Failures rule |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| ✅     | value ≤ threshold                                                                                                           | ≤ 3%                     |
| 🔴     | value > threshold                                                                                                           | > 3%                     |
| —      | no formal threshold (cells where the engine doesn't define one — currently none on L0 since all 80,000 ms cells are scored) | —                        |

**User-facing rule (revised 2026-05-06):**

- **Slack: ALWAYS render the one-line L0 status** — `✅ **L0 — No breach** ([Looker dashboard](URL))` when clean, or `🔴 **L0 — Breach** ([Looker dashboard](URL))` followed by per-panel breach bullets when not. Do NOT include latency P90 numbers or the failure-rate value when the phase is clean — that context lives in the canvas TL;DR. When breached, list ONLY the breached panels/cells as bullets with value + threshold; never the full panel table.
- **Canvas L0 section: breach-only — no status table even with ✅ rows.** When clean, render the section as: `✅ **L0 — No breach**` + `### L0 Findings` + `### L0 Actions`. When any panel breaches, render only the 🔴 row(s) with value + threshold + status — never the full panel table.
- The Looker dashboard link goes on the L0 phase header (`📊 [Looker — L0 dashboard](URL)`), not per panel.

**CS Background latency is internal-only context — never include in user-facing canvas/Slack output.** It is not on the dashboard.

---

## Phase 2 — L1 drill-down

Run automatically regardless of L0 status (always do this). Compute success/partial/failure % per **track × scan type**, where the tracks are `AUT / CS / WA` (CS = OnDemand + Background combined; do NOT split here).

**CRITICAL: count by `COUNT(DISTINCT kind.uuid)`, never by row count.** Confirmed 2026-05-05: AI scan types (`ADVANCE_SCAN_RUN_AI`) emit ~30 EDS rows per distinct scan UUID (one per check/rule). Row-counting inflates AI numbers ~30× and misreports breaches. Pattern:

```sql
WITH deduped AS (
  SELECT track, scan_type, kind.uuid AS uuid,
    MAX(CASE WHEN status='FAILURE' THEN 2 WHEN status='PARTIAL_SUCCESS' THEN 1 ELSE 0 END) AS worst
  FROM exploded
  GROUP BY 1,2,3
)
SELECT track, scan_type,
  COUNT(*) AS total_scans,
  SUM(IF(worst=0,1,0)) AS success,
  SUM(IF(worst=1,1,0)) AS partial,
  SUM(IF(worst=2,1,0)) AS failure,
  ROUND(100.0 * SUM(IF(worst=0,1,0)) / COUNT(*), 2) AS success_pct
FROM deduped
GROUP BY 1,2
```

Take the **worst status across all rows for the same uuid** (FAILURE > PARTIAL > SUCCESS) — this matches "what status would the user see for this scan?". Apply the same DISTINCT-uuid pattern in Phase 5a (group attribution) for consistency. Total scans across the whole table will look smaller than the old row-counted L1 numbers — that's correct.

**Binary L1 threshold:**

| Status | Success % rule |
| ------ | -------------- |
| ✅     | ≥ 95%          |
| 🔴     | < 95%          |

**User-facing L1 output rule (revised 2026-05-06):**

- **Slack: ALWAYS render the one-line L1 status** — `✅ **L1 — No breach** ([Looker dashboard](URL))` when clean, or `🔴 **L1 — Breach** ([Looker dashboard](URL))` followed by per-breach bullets when not. Do NOT omit the L1 block on a clean day; the reader needs the explicit ✅ line per phase to scan the day at a glance. (Phase 8 covers exact bullet shape for breaches.)
- **Canvas L1 section: breach-only — no status table even with ✅ rows.** When clean, render the section as: `✅ **L1 — No breach**` + `### L1 Findings` + `### L1 Actions`. When breached, render only 🔴 rows as bullets (no full 15-row grid). Each 🔴 row carries: track, scan type, success %, failures/partials/total, plus the one-line attribution and the JIRA action linked from `### L1 Actions`.
- **CS is one combined row per scan type** (OnDemand + Background folded together). Computed as `SUM(success across both subsets) / SUM(total across both subsets)`. CS Background is no longer hidden — it is folded into CS.
- In the Slack message, the "all others ≥ 95% ✅" reassurance line goes inside the Slack L1 block as the bullet `Rest others are ✅` (see Phase 8).

---

## Phase 3 — L2 error summary

Panel 1 of L2 — total errors and rate per scan type, with product splits. Use `l2_error_queries.md`.

---

## Phase 4 — L2 detailed error buckets (**include check_errors**)

Extended version of the L2 detailed query that **also** unnests `check_errors`. Buckets covered:

- `runtime_errors`, `server_errors`, `debug_errors`
- `DOM_FORGE_CORE_ERROR`, `PERCY_RENDERER_ERROR`, `SCRIPT_DOWNLOAD_ERROR`
- `uncategorized_errors` (direct error/message/stack objects)
- **`check_errors.<check-name>`** (per-check error arrays — see below)

### check_errors — run as a SEPARATE query (NOT a UNION branch)

**Critical gotcha confirmed in practice:** BigQuery's `JSON_EXTRACT_ARRAY` requires its second argument (the path) to be a **constant expression**. You cannot pass `CONCAT('$["', check_name, '"]')` — it errors with `Argument 2 to JSON_EXTRACT_ARRAY must be a constant expression`. Any pattern that tries to UNNEST check_error arrays with a dynamic path will fail.

**Working pattern:** use a JS UDF that parses `check_errors` and returns `ARRAY<STRUCT<check_name, cnt>>`, then `UNNEST` that. Run as its own Phase 4b query; don't try to UNION it into the main detailed-errors CTE.

```sql
CREATE TEMP FUNCTION checkErrorCounts(s STRING)
RETURNS ARRAY<STRUCT<check_name STRING, cnt INT64>>
LANGUAGE js AS r"""
  try {
    const o = JSON.parse(s);
    if (!o || typeof o !== 'object') return [];
    return Object.entries(o)
      .filter(([k, v]) => Array.isArray(v) && v.length > 0)
      .map(([k, v]) => ({check_name: k, cnt: v.length}));
  } catch (e) { return []; }
""";

WITH raw_data AS (
  SELECT
    JSON_VALUE(kind, '$.arr[0].type') AS kind_type,
    COALESCE(JSON_VALUE(product, '$.arr[0].name'), JSON_VALUE(product_metadata, '$.arr[0].name')) AS product_name,
    errors
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
  WHERE _PARTITIONTIME >= <partition-start>
    AND _PARTITIONTIME < <partition-end>
    AND created_at >= <day-start>
    AND created_at < <day-end>
    AND JSON_VALUE(kind, '$.arr[0].type') IN (
      'ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_DOMFORGE','SCAN_RUN')
),
check_rows AS (
  SELECT rd.kind_type, rd.product_name, ce.check_name, ce.cnt AS err_count
  FROM raw_data rd,
    UNNEST(JSON_EXTRACT_ARRAY(rd.errors, '$.arr')) AS error_obj,
    UNNEST(checkErrorCounts(TO_JSON_STRING(JSON_EXTRACT(error_obj, '$.check_errors')))) AS ce
  WHERE JSON_EXTRACT(error_obj, '$.check_errors') IS NOT NULL
)
SELECT check_name, kind_type,
  SUM(err_count) AS total_errors,
  SUM(IF(product_name='WEBSITE_SCANNER', err_count, 0)) AS cs,
  SUM(IF(product_name='AUTOMATED_TESTS', err_count, 0)) AS aut,
  SUM(IF(product_name='WORKFLOW_ANALYSER', err_count, 0)) AS wa
FROM check_rows
GROUP BY check_name, kind_type
ORDER BY total_errors DESC
LIMIT 25
```

**Interpretation note:** check_errors reflect per-rule evaluation bugs that accumulate over time, NOT incident-level failures. At typical scale they're <5% of named-bucket error volume. Don't lead the Lead section with them unless a specific check suddenly 10xs day-over-day. See `references/signatures.md` C1.

---

## Phase 5 — Group attribution

Two tables (per the "top by volume vs. top by tail" pattern). **Use the same `COUNT(DISTINCT uuid)` deduping as Phase 2** — never row-count.

### 5a. Top groups driving failures

Per `(group_id, product, scan_type)`, compute three columns: **Failures**, **Total Scans**, **Failure %** = Failures / Total Scans. Apply the known-failure exclusion filters. Order by Failures DESC, limit 15.

```sql
WITH deduped AS (
  SELECT group_id, product_name, scan_type, uuid,
    MAX(CASE WHEN status='FAILURE' THEN 1 ELSE 0 END) AS is_failure
  FROM exploded
  GROUP BY 1,2,3,4
)
SELECT group_id, product_name, scan_type,
  COUNT(*) AS total_scans,
  SUM(is_failure) AS failures,
  ROUND(100.0 * SUM(is_failure) / COUNT(*), 2) AS failure_pct
FROM deduped
GROUP BY 1,2,3
HAVING failures > 0
ORDER BY failures DESC
LIMIT 15
```

The Failure % column is mandatory in user-facing output (canvas + Slack) — readers want to know whether the absolute failure count represents 100% of a tiny fleet or 1% of a huge one. A 100% rate on a 14-scan group is a different shape from a 12% rate on a 2,742-scan group.

### 5b. Top groups driving latency tail

For each breached latency metric, compute the P90 threshold value. Then `SELECT group_id, COUNT(*) AS tail_events, AVG(latency) FROM ... WHERE latency >= threshold GROUP BY group_id ORDER BY tail_events DESC LIMIT 15`.

### 5c. Per-breach concentration sub-tables

When an L1 breach concentrates in a small number of groups (e.g. > 50% of the breach driven by ≤ 3 groups), add a dedicated sub-table for that breach showing per-group total scans, fails (or partials, depending on what's driving the breach), and rate. Example shapes already in use:

- "AUT AI scan-timeout — 100% failure-rate concentration" (when groups go 100% on a tiny fleet)
- "CS AI partial concentration" (when partials, not failures, drive a success-% breach)

One group dominating the tail → customer-specific issue. Even spread → systemic.

---

## Phase 6 — Output structure

The skill produces output for **two surfaces** — the in-chat report (for the user) and the Slack/Canvas pair (when explicitly asked to share). Both are organised by phase (L0 → L1 → L2) and both are **breach-only** in the status tables:

- **In-chat report**: bifurcated L0 → L1 → L2; can mention signature IDs (S1, S2, …) internally. Each phase block opens with its Looker link, lists only breached metrics, then ends with `### Lx Findings` + `### Lx Actions` (L0/L1 only).
- **Slack message**: same structure as in-chat but more compressed — see Phase 8. No signature IDs.
- **Canvas**: same bifurcation as in-chat. Status tables show breached metrics only (no full ✅ tables). What the canvas adds over the Slack message is the depth: group-attribution sub-tables, error-bucket breakdowns, inner-error drill-down for top buckets, ASSET_CAPTURE + B1 debug sub-sections at the end of L2. No `# title` line (auto-prepended).

### In-chat / canvas report — bifurcated section order

The canvas TL;DR carries ALL supporting context (latency P90 numbers, error rate top driver, customer concentration, action summary) so that the phase blocks stay lean. Phase blocks themselves are breach-only — no ✅ status tables even when clean.

```
## TL;DR (5–7 bullets when clean — moves all narrative context here so the phase sections stay lean)
- ✅/🔴 **L0** — failure rate vs threshold; latency headroom note (closest panel to ceiling)
- ✅/🔴 **L1** — lowest success-% rows OR breaches w/ JIRA actions
- ✅/🔴 **L2** — top error driver(s); error rate vs 5% threshold
- Customer-concentration note (top 3 groups % of failures, if applicable)
- **Actions**: <semicolon-separated JIRA tickets, or "None — all phases clean">

## L0 — Engine health
📊 Looker — L0 dashboard
<— breach-only: when clean, render exactly "✅ **L0 — No breach**" and skip directly to Findings. When any panel breaches, render only the 🔴 row(s) as bullets with value + threshold + status. Do NOT render a status table of all-✅ panels. —>
### L0 Findings
### L0 Actions (JIRA tickets for L0 breaches; "No L0 breach → no L0 ticket" if clean)

## L1 — Per-track success %
📊 Looker — L1 dashboard
<— breach-only: when clean, render exactly "✅ **L1 — No breach**" and skip to Findings. When breached, render only the 🔴 rows as bullets with track + scan type + success % + (failures / total) + attribution + JIRA action. —>
### L1 Findings
### L1 Actions (JIRA tickets for L1 breaches; "No L1 breach → no L1 ticket" if clean)

## L2 — Error analysis
📊 Looker — L2 dashboard
<— L2 phase block in canvas is "error buckets only": render the relevant error-bucket sub-sections (ASSET_CAPTURE, B1 debug, top error messages, inner-error drill-down, check_errors) WHEN they carry signal for the day. Do NOT render an Error Rate by Scan Type panel summary table — that lives in TL;DR if it carries a breach. —>
### ASSET_CAPTURE Error Buckets (always render — this is the most common L2 surface)
### Top Error Messages (only when L1 breached; excludes ASSET_CAPTURE + B1 debug)
### "<Top error message>" — Inner Error Breakdown (when a bucket dominates ≥50% of L1 failures)
### B1 debug_errors (only when notable — usually omit on a clean day)
### check_errors (chronic; only render when a check 10xs day-over-day per signature C1 exception)
### L2 Findings
### L2 Actions (note: L2 does NOT auto-create tickets; if an L2 driver caused an L0/L1 breach, the ticket lives in that phase's Actions table)

## Top Failure Groups (always render — gives reader customer-attribution context regardless of breach status)
### AUT/CS/WA-specific concentration tables (when relevant)
```

In-chat may include an additional `**Fields referenced**` block right after TL;DR for transparency on which BQ columns were read. The canvas omits it.

### Bucket exclusions (L2 main table)

The L2 "top error messages" table that lands in TL;DR/L1/Slack always **excludes** these two bucket families because they are chronic noise that distorts the signal:

- All `ASSET_CAPTURE` rows (any bucket). Surface them only in the dedicated "ASSET_CAPTURE Error Buckets" sub-section at the end of L2.
- `ADVANCE_SCAN_RUN` (B1) `debug_errors` rows. These are debug-level (S7-style "Element Undefined in custom element null", "CurrentSelector Undefined") — they don't fail scans. Surface them only in the dedicated "B1 debug_errors" sub-section at the end of L2.

Type A `debug_errors` (e.g. SCAN_RUN debug) **are kept** in the main table — only B1 debug is excluded.

### Phase 4c — top-bucket inner-error drill-down (REQUIRED when applicable)

When a single error message dominates a bucket (e.g. ≥50% of B1 runtime_errors), unnest the `.error` field of that bucket and show the inner errors:

```sql
SELECT
  normalize_error_message(COALESCE(REGEXP_EXTRACT(JSON_VALUE(err, '$.error'), r'^[^\n]+'), '(null)')) AS inner_error,
  COUNT(*) AS events,
  SUM(IF(product_name='WEBSITE_SCANNER', 1, 0)) AS cs,
  SUM(IF(product_name='AUTOMATED_TESTS', 1, 0)) AS aut,
  SUM(IF(product_name='WORKFLOW_ANALYSER', 1, 0)) AS wa
FROM raw_data rd, UNNEST(JSON_EXTRACT_ARRAY(rd.errors_obj, '$.runtime_errors')) AS err
WHERE JSON_VALUE(err, '$.message') = '<DOMINANT MESSAGE>'
GROUP BY 1 ORDER BY events DESC
```

Confirmed against 2026-04-23 data: the `.error` field IS populated for B1 runtime_errors (478/479 events). The S2 signature note about "real error discarded at emit" applies only to `stack.description` / `stack.code`, not to `.error`. **Always run the drill-down — do not assume the bucket is opaque.**

### Fixes table (mandatory format)

Each remaining fix item gets a row. **Excluded from this table:** "watch X tomorrow" notes — those are internal monitoring, not fixes.

| #   | Fix                                        | JIRA                                                                            | Status                    | Priority     | Assignee |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------- | ------------ | -------- |
| 1   | <one-line description with code reference> | [PROJ-NNN](https://browserstack.atlassian.net/browse/PROJ-NNN) — <ticket title> | Open / In Progress / Done | P0 / P1 / P2 | <name>   |
| 2   | <description>                              | TBD — create new JIRA, assign to OPS                                            | —                         | —            | OPS      |

Workflow: for each fix, search JIRA (`searchJiraIssuesUsingJql` with `text ~ "<keyword>" AND project in (AXE, OPS)`) before creating new tickets. If no ticket exists, create one in the appropriate project (default OPS for ops/infra, AXE for engine) and assign to OPS unless told otherwise. Always cite the JIRA URL in the table.

## The mandatory `## TL;DR` section (canvas top — carries the day's full narrative)

Before any phase blocks, output a TL;DR so a reader understands the day from a few bullets. **Consult `references/signatures.md` internally before writing it** — but DO NOT mention signature IDs (S1, S2, …) in the TL;DR itself. Those are internal-only.

**The canvas TL;DR is where ALL supporting context lives** — latency P90 numbers, L2 top error sources, customer-concentration notes, action summary. The phase blocks stay lean because the TL;DR already gave the reader the picture. The Slack message does NOT carry these bullets — it's strictly L0/L1 status lines (see Phase 8).

**Binary status only on L0 and L1** — never use 🟡. **L2 is NOT binary** — never write `✅ L2 — No breach` or `🔴 L2 — Breach` in the TL;DR; L2 surfaces as an error overview, not a pass/fail check.

```
## TL;DR

- ✅/🔴 **L0** — failure rate (X% / 3% threshold); closest latency panel to ceiling (e.g. "CS OnDemand Max(B1,C) at 78s vs 80s")
- ✅/🔴 **L1** — when clean: lowest success-% rows for context (e.g. "lowest = CS Type B1 96.89%, all ≥ 95%"). When breached: bullets per breach with track + scan-type + success% → JIRA-key (priority).
- **L2 (error overview, not pass/fail)** — top error sources and rates (e.g. "ASSET_CAPTURE 4.07% CS-dominant; B1 errors 2.4%; A/B2/C/AI < 0.5%"). NO ✅/🔴, NO "breach" wording.
- Latency headroom note (closest-to-threshold panel + sample-size caveat if relevant)
- Customer-concentration note (top 3 groups owning N% of failures, if ≥70% concentration)
- **Actions**: <semicolon-separated JIRA tickets, or "None — all phases clean">
```

Always include a line for L0, L1, and L2 — even when L0 and L1 are clean. L0 and L1 carry binary ✅/🔴 status; L2 carries informational error sourcing only.

## Phase 7 — Learnings block (mandatory)

End every L0 run with a short block the user can save to memory. Format:

```
### Learnings for memory (save if useful)
- <specific finding that wasn't already in memory/references>
- <pattern that proved useful or a pitfall to avoid>
- <anything about thresholds, table shape, or filters that surprised us>
```

Keep to 2–4 bullets. Skip the block only if nothing new was learned.

---

## Phase 8 — Slack message + Canvas posting protocol

Use this when the user asks to share the report on Slack (e.g. "post in this thread / channel"). Always confirm the destination before sending. Posting is a shared-state action — never auto-post without explicit user direction including a channel/thread URL.

### Two artefacts, ONE message

Produce both the Slack status lines AND the canvas link in a **single thread reply** — never split across two messages. Order inside the message:

1. **Title line** — `**a11y-engine L0 Health Check — YYYY-MM-DD**`
2. **L0 status line** — `✅/🔴 L0 — ...` (always)
3. **L1 status line** — `✅/🔴 L1 — ...` (always; breach bullets inline if 🔴)
4. **Canvas link line** — last line of the same message, e.g. `Full analysis (TL;DR + L0/L1 + L2 error overview + top failure groups) — canvas: [<title>](<canvas_url>)`

The canvas itself contains the bifurcation with full depth: TL;DR, L0/L1 phase blocks, L2 error overview (no breach status), group attribution, error-bucket breakdowns, inner-error drill-down, ASSET_CAPTURE / B1 debug sub-sections. Create the canvas BEFORE posting the Slack message so the canvas URL is available to embed.

**Both surfaces are breach-only on the status tables.** The canvas does not show ✅ rows — it earns its keep over the Slack message via the TL;DR narrative + depth sub-tables (group attribution, error buckets, inner-error drill-down), not via a "full grid with all cells coloured" layout. If a phase has no breach, both surfaces render exactly: `✅ <Phase> — No breach ([Looker dashboard](URL))`.

### Slack message — content & format

**Status-only, L0+L1 only, no narrative.** The Slack message is the 5-second scan: one line for L0, one line for L1, plus inline breach bullets if either 🔴'd. **No L2 line — L2 is informational, not pass/fail, and is never rendered in Slack.** ALL supporting context (latency P90 numbers, top failure groups, L2 error overview) lives in the canvas TL;DR — never in the Slack message body. The reader who wants the L2 error overview clicks the canvas link.

Required structure (single message, in order):

```
**a11y-engine L0 Health Check — YYYY-MM-DD**

✅ **L0 — No breach** ([Looker dashboard](https://browserstack.looker.com/dashboards/2867))
   <— OR, if L0 breached, "🔴 **L0 — Breach**" + bullets for ONLY the breached panels/cells with value vs threshold + JIRA action. Do NOT include latency P90 numbers or failure-rate value when clean. —>

✅ **L1 — No breach** ([Looker dashboard](https://browserstack.looker.com/dashboards/2938))
   <— OR, if L1 breached, "🔴 **L1 — Breach**" + per-breach bullets (see L1 breach shape below). Always render the one-line status, even when clean. —>
```

L2 never appears in the Slack body. Do NOT render `✅ L2 — No breach`, `🔴 L2 — Breach`, or any L2 status line — L2 is not pass/fail. The L2 error overview lives only in the canvas.

L1 breach shape (only when 🔴):

```
🔴 **L1 — Breach** ([Looker dashboard](https://browserstack.looker.com/dashboards/2938))

*Failure metric (success % threshold: ≥ 95%)*
- **<Track> <Scan Type>: <X%>** 🔴 (<failures> / <total> scans)
  - <one-line attribution> (e.g. "2 groups (57114: 335, 10846394: 137) account for 100% of AUT AI failures, both at 100% failure rate")
  - Action: [JIRA-KEY](URL) — <ticket title> (<priority>)
- Latency P90 — no breach ✅  *(or list breached latency panels with JIRA actions as bullets)*
- Rest others are ✅
```

### Slack message rendering rules

- **L0 and L1 each get a one-line status** — `✅ <Phase> — No breach ([Looker dashboard](URL))` when clean, `🔴 <Phase> — Breach (...)` + breach bullets when not. Do NOT omit clean phase blocks. Reader needs explicit per-phase confirmation to scan the day.
- **L2 is NOT rendered in Slack at all.** L2 is not pass/fail — it's an error overview. Never write `✅ L2 — No breach`, `🔴 L2 — Breach`, or any L2 status line in the Slack body. L2 content lives only in the canvas.
- **Slack message body is status-only.** No latency P90 numbers, no top failure groups, no error-rate top driver, no narrative bullets when phases are clean. All of that lives in the canvas TL;DR. The Slack message stays at ~3 lines on a clean day (title + L0 + L1).
- **`Latency P90` and `Rest others` are bullets inside the L1 block** when L1 breaches, not separate paragraphs.
- The canvas link goes as a separate follow-up reply in the same thread.

### Slack formatting gotchas (confirmed in practice)

- **Never use `---` horizontal rules.** Slack's `slack_send_message` returns `invalid_blocks` when `---` appears in markdown alongside text + code blocks. Use blank lines or `**bold headings**` for section breaks instead.
- **Char limit ≈ 5,000.** If the message would exceed, split into multiple replies in the same thread (TL;DR first, L0+L1 second, etc.). Keep each split self-contained.
- `**bold**`, `` `code` ``, fenced code blocks, and emoji ✅ 🟡 🔴 all render correctly.
- Markdown tables do NOT render aligned in regular Slack messages — use a fenced code block with manually-aligned columns (monospace) instead.

### Canvas — content & format

Use `slack_create_canvas` (one canvas per L0 run; title = `a11y-engine L0 Health Check — YYYY-MM-DD`). The canvas mirrors the bifurcated in-chat report:

- **No `# title` line in content** — Slack auto-prepends the title from the `title` parameter; including an explicit H1 produces a duplicate heading.
- **Avoid `* footnote` at line-start** — Slack canvas renders any line starting with `*` as a list bullet. Use `(note: …)` inline within the cell or as a paragraph below the table.
- Markdown tables DO render correctly in canvas (unlike in messages).
- **Status column is binary ✅ / 🔴 only** — never 🟡, never a "watchlist" / "warning" band, never a status legend explaining a third tier.
- **Status tables are breach-only.** When a phase has no breach, the phase's status section renders exactly `✅ **<Phase> — No breach**` — do NOT show a full table of ✅ rows. The canvas adds value through the depth sub-tables (group attribution, inner-error breakdown, error buckets), not through a coloured grid of every metric.
- **Findings + Actions sub-sections** under each phase block. `### Lx Findings` is mandatory (1–3 bullets); `### Lx Actions` is mandatory for L0/L1 (JIRA table when there's a breach, or "No <Lx> breach → no <Lx> ticket" when clean). L2 Actions section explicitly says L2 does not auto-create tickets.
- **Default to creating a FRESH canvas per L0 run** (title `… — YYYY-MM-DD` or `… — YYYY-MM-DD (vN)` if re-doing the same day). Confirmed 2026-05-05 across multiple incidents: (a) `slack_update_canvas` with `section_id` on table cells leaves empty residue rows; (b) even `action: replace` with no `section_id` has produced doubled rendered content (markdown source looks correct, but Slack shows every section twice). Mutation is unreliable. Make a new canvas, paste the latest content, link the new id from the message.
- **When you create a fresh canvas, the returned `canvas_id` is new.** Verify that the URL substring in the Slack message you post matches the just-returned id — it's easy to paste an older id by accident.

### Canvas section order (bifurcated; matches in-chat report)

```
## TL;DR  (5–7 bullets — carries the full narrative; phase blocks below stay lean)

## L0 — Engine health
📊 [Looker — L0 dashboard](URL)
<— breach-only: when clean, render exactly "✅ **L0 — No breach**" and skip directly to Findings. When any panel breaches, render the breach as bullet(s) with value + threshold + status. Do NOT render a status table of all-✅ panels. —>
### L0 Findings
### L0 Actions

## L1 — Per-track success %
📊 [Looker — L1 dashboard](URL)
<— breach-only: when clean, render exactly "✅ **L1 — No breach**" and skip directly to Findings. When breached, render only the 🔴 rows as bullets with track + scan type + success % + (failures / total) + attribution + JIRA action. —>
### L1 Findings
### L1 Actions

## L2 — Error overview
📊 [Looker — L2 dashboard](URL)
<— L2 is informational, NOT pass/fail. Do NOT render `✅ L2 — No breach` or `🔴 L2 — Breach`. Open the section with one short line explaining L2 is an error-source overview, then render the bucket sub-sections that carry signal for the day. NO Error Rate by Scan Type panel summary table. NO ✅/🔴 status anywhere in this section. —>
### ASSET_CAPTURE Error Buckets (always render — most common L2 surface; small section even on clean days)
### Top Error Messages (only when L1 breached; excludes ASSET_CAPTURE + B1 debug)
### "<Top error message>" — Inner Error Breakdown (when a bucket dominates ≥50% of L1 failures)
### B1 debug_errors (only when notable — usually omit on a clean day)
### check_errors (chronic; only when a check 10xs day-over-day per signature C1 exception)
### L2 Findings
### L2 Actions (note: L2 does NOT auto-create tickets; "no L0/L1 breach driven by L2" when clean)

## Top Failure Groups (always render — top-N table for customer-attribution context)
### <track-specific concentration tables when relevant>
```

### Posting workflow (never skip a step)

1. Draft the canvas content AND the Slack message body together; show the user before sending if any section is new or if the user hasn't already approved a similar draft this session.
2. Create the canvas via `slack_create_canvas` FIRST. Capture the returned `canvas_id` and `canvas_url`.
3. Post ONE Slack message via `slack_send_message` with `thread_ts` set to the thread parent. The message body contains the L0 + L1 status lines AND the canvas link inline at the bottom — single message, never split.
4. **Never silently re-post.** If the user iterates on the draft, create a fresh canvas (mutation is unreliable — see Canvas formatting rules) and post the latest combined message as a new thread reply, asking the user to ignore older replies (the API does not expose `delete_message`).

---

## Performance notes

- Phase 1a (failures): ~5–15s
- Phase 1b (latencies): ~10–30s
- Phase 2 (L1): ~30–60s per day
- Phase 3 (L2 summary): ~10–20s
- Phase 4 (L2 detailed with check_errors): ~30–90s (most expensive)
- Phases 5a/5b: ~5–10s each
- Total for single day: ~2–4 minutes of BQ compute

Run phases 1a+1b and 5a+5b **in parallel** where possible (independent). Phase 4 must follow Phase 3.
