# Assisted Tests — AT errors Queries

The "**AT errors**" phase is reported alongside scanner L0/L1 in the same Slack message and canvas. Current scope: **flag any rise in non-timeout error rate**. Latency / completion / per-check drivers are out of scope until requested.

Naming note: this phase is **always labelled "AT errors"** in any user-facing output (Slack, canvas TL;DR, canvas section heading, JIRA title). Do not call it "AT L0" — that label is internal-history only. Filenames and internal references keep their existing names.

Looker dashboard: https://browserstack.looker.com/dashboards/2976

## Data shape

AT events live in the same table as scanner events but under a different `product.name`:

- Table: `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
- Filter: `JSON_EXTRACT_SCALAR(product, '$.name') = 'ASSISTED_TESTS'`
- Error path: `errors.arr[*]['AT-ERROR'][*].message` — note the nested `AT-ERROR` array inside each `errors.arr` element.
- Join the `product.arr` and `kind.arr` parallel arrays via `WITH OFFSET USING(OFFSET)` exactly like the scanner pattern.

### Error categorisation

| Bucket | Message pattern | Meaning |
|---|---|---|
| **Timeout** | `LIKE '%timed out%' OR LIKE '%timeout%'` (lowercased) | 20-min idle abandonment from the `setTimeout` in `assistedTestsHandler.js`. **User-driven, not an engine failure.** Informational only — never breach. |
| **Non-timeout** | everything else with a non-null `$.message` | Genuine engine failures. **This is the AT errors breach metric.** |

## Query — 7-day daily series (breach metric)

```sql
WITH daily_stats AS (
  SELECT
    DATE(stats.created_at) AS log_date,
    COUNT(JSON_EXTRACT_SCALAR(at_errors, '$.message')) AS error_count,
    COUNTIF(
      LOWER(JSON_EXTRACT_SCALAR(at_errors, '$.message')) LIKE '%timed out%'
      OR LOWER(JSON_EXTRACT_SCALAR(at_errors, '$.message')) LIKE '%timeout%'
    ) AS timeout_error_count,
    COUNTIF(
      JSON_EXTRACT_SCALAR(at_errors, '$.message') IS NOT NULL
      AND NOT (
        LOWER(JSON_EXTRACT_SCALAR(at_errors, '$.message')) LIKE '%timed out%'
        OR LOWER(JSON_EXTRACT_SCALAR(at_errors, '$.message')) LIKE '%timeout%'
      )
    ) AS non_timeout_error_count,
    COUNT(*) AS total_runs
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` AS stats,
    UNNEST(JSON_EXTRACT_ARRAY(stats.errors, '$.arr')) AS errors WITH OFFSET
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(errors, '$.AT-ERROR')) AS at_errors
    JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
    JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.product, '$.arr')) AS product WITH OFFSET USING(OFFSET)
  WHERE
    stats.created_at >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -6 DAY)
    AND stats.created_at < TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 DAY)
    AND stats._PARTITIONTIME >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -6 DAY)
    AND stats._PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL 1 DAY)
    AND JSON_EXTRACT_SCALAR(product, '$.name') = 'ASSISTED_TESTS'
  GROUP BY 1
)
SELECT
  log_date,
  total_runs,
  error_count,
  timeout_error_count,
  non_timeout_error_count,
  ROUND(SAFE_DIVIDE(non_timeout_error_count * 100.0, total_runs), 2) AS non_timeout_error_percentage,
  ROUND(SAFE_DIVIDE(timeout_error_count * 100.0, total_runs), 2) AS timeout_error_percentage
FROM daily_stats
ORDER BY log_date DESC;
```

Note: `total_runs` is the row count **after** the errors-array unnest, so it's per-error-row not per-session. Treat it as a relative volume signal, not a session count. The breach formula uses ratios, so the per-row inflation cancels out as long as it's stable across days.

## Breach evaluation

Given the 7-day series above, let:
- `today_pct` = `non_timeout_error_percentage` for today's row
- `prior_pct_median` = median of `non_timeout_error_percentage` over the prior 6 days (exclude today)
- `today_runs` = `total_runs` for today
- `prior_runs_median` = median of `total_runs` over the prior 6 days

**Volume context (dynamic, never skips reporting):**

Compute `low_volume_today = (today_runs < 0.3 * prior_runs_median)`. **Always report the day's numbers** (`total_runs`, `error_count`, `non_timeout_error_count`, `non_timeout_error_percentage`, `timeout_error_count`) regardless of the flag — we never want a silent gap in the report.

The flag only changes how the breach status is **narrated**, not whether the row is shown.

**Breach condition:**

A `breach_triggered` boolean is true if **either** holds:

1. `today_pct > prior_pct_median + 2.0` (absolute rise: >2 percentage points above the 7-day baseline), **OR**
2. `today_pct > 2 * prior_pct_median` (relative rise: more than double the baseline)

Edge case: if `prior_pct_median = 0`, fall back to rule 1 only (any value > 2pp triggers).

**Status resolution (canvas/JIRA wording — Slack is one-liner only, see below):**

| `breach_triggered` | `low_volume_today` | Status | Canvas wording |
|---|---|---|---|
| false | false | ✅ | `✅ AT errors — No breach` |
| false | true  | ✅ | `✅ AT errors — No breach (low volume: {today_runs} runs vs 7-day median {prior_runs_median})` |
| true  | false | 🔴 | `🔴 AT errors — Breach — non-timeout error rate {today_pct}% (7-day median {prior_pct_median}%)` |
| true  | true  | ⚠️ | `⚠️ AT errors — Elevated error rate {today_pct}% (7-day median {prior_pct_median}%), but volume is low ({today_runs} vs median {prior_runs_median}) — error signal may be noise, review before escalating` |

The last row is the key change vs. the earlier design: low-volume days with elevated errors are still surfaced (data shown, signal narrated), but they're labelled ⚠️ rather than 🔴 so a reader knows the breach formula tripped on a small sample and may not warrant a P1.

## Reporting

### Slack (single combined message — pure one-liners)

Slack is a TL;DR-only surface. Each phase gets exactly **one line**, no numbers, no context, no inline detail. All breach values, baselines, and volume notes live in the canvas.

Format per phase: `<emoji> <Phase> — <status> ([Looker dashboard](URL))`

For AT errors specifically:

| Case | Slack line |
|---|---|
| ✅ Clean (any volume) | `✅ AT errors — No breach ([Looker dashboard](https://browserstack.looker.com/dashboards/2976))` |
| 🔴 Breach (normal volume) | `🔴 AT errors — Breach ([Looker dashboard](https://browserstack.looker.com/dashboards/2976))` |
| ⚠️ Breach but low volume | `⚠️ AT errors — Elevated, low volume ([Looker dashboard](https://browserstack.looker.com/dashboards/2976))` |

Never omit the line. Never inline numbers, percentages, or run counts in the Slack message — those go in the canvas.

### Canvas

Add an `## AT errors — <status>` section after the scanner L1 block and before L2. Body:

- One-line status (full wording from the status-resolution table above — includes the numbers, baseline, and volume note).
- 7-day mini-table: `log_date | total_runs | non_timeout_error_count | non_timeout_error_percentage | timeout_error_count`.
- `### AT errors Findings` — terse note on direction (rising / flat / volume note). Mention timeout count only if it's an outlier (>2× prior median); otherwise omit.
- `### AT errors Actions` — on a full breach (🔴), file a JIRA against AXE (same custom fields as scanner: `customfield_10103: "Ops: Other Tasks"`, `customfield_10104: "Engineering"`), assign to the user, priority P1 by default. Title: `AT errors breach — non-timeout error rate {today_pct}% on {log_date}`. **Do NOT auto-file** on the low-volume ⚠️ case — note it in actions as "Monitor; rerun once volume recovers" so we don't churn tickets on small-sample noise.

### Canvas TL;DR line

The canvas TL;DR carries one line per phase, peer to L0 and L1. Examples:

- `AT errors: ✅ No breach`
- `AT errors: ✅ No breach (low volume: 12 runs vs 7-day median 87)`
- `AT errors: 🔴 Breach — non-timeout error rate 7.4% (7-day median 1.1%)`
- `AT errors: ⚠️ Elevated 7.4% (7-day median 1.1%), low volume (12 vs median 87) — may be noise`

## Not in scope (yet)

- Per-check drivers, completion drop-off, latency for AT — leave as TODO until requested.
- Group/user attribution for AT errors — TODO.
- AT-specific signatures — none catalogued yet.
