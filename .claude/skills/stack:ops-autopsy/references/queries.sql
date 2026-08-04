-- ops-autopsy BQ queries. Run via:
--   bq query --quiet --project_id=browserstack-production --nouse_legacy_sql --format=csv < /tmp/q.sql
-- Substitute @DAYS / @SCOPEKEY / @RUNID / @REPORTID / @USERID / @GROUPID / @URLPATTERN / @SIGNATURE
-- literally (no parameter flags). Always bound _PARTITIONTIME. Read schema.md for the column map.

-- =============================================================================
-- TIMELINE  (Step 2) — one row per engine event for the scopeKey. THE core query:
-- timeline + error detail + asset-capture rows in a single job (do NOT split).
-- Its has_errors expression is the canonical one — DISCOVERY pastes it verbatim.
-- (A clean row's errors arr[0] holds only {type, uuid}, so it stays cheap.)
-- =============================================================================
SELECT
  created_at,
  JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(kind, '$.arr')[SAFE_OFFSET(0)], '$.type') AS kind,
  JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(data, '$.arr')[SAFE_OFFSET(0)], '$.status') AS status,
  -- TWO metadata shapes: server TCP events keep fields flat in arr[0]; browser/devtools HTTP
  -- events (ASSET_CAPTURE, UPTIME_METRIC_COLLECTION) nest them under $.productMetadata.
  COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scanRunId'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scanRunId')
  ) AS runId,
  COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product, '$.arr')[SAFE_OFFSET(0)], '$.name'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.name')
  ) AS product,
  user.user_id, user.group_id,
  JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(url, '$.arr')[SAFE_OFFSET(0)], '$.url') AS url,
  JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(latency, '$.arr')[SAFE_OFFSET(0)], '$.a11y_engine_scan') AS scan_latency_ms,
  (
    JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.runtime_errors') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.server_errors') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.PERCY_RENDERER_ERROR') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.DOM_FORGE_CORE_ERROR') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.SCRIPT_DOWNLOAD_ERROR') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.instrumentation_errors') IS NOT NULL
    OR JSON_EXTRACT(JSON_EXTRACT_ARRAY(errors, '$.arr')[SAFE_OFFSET(0)], '$.error') IS NOT NULL
    OR JSON_EXTRACT(errors, '$.check_errors') IS NOT NULL
  ) AS has_errors,
  TO_JSON_STRING(errors) AS errors_raw  -- read buckets from here on has_errors rows; no 2nd query
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @DAYS DAY)
  AND COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scopeKey'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scopeKey')
  ) = '@SCOPEKEY'
ORDER BY created_at;

-- =============================================================================
-- RESOLVE --report-id  — only when you need the uuid↔report_id↔proxy_map_path mapping,
-- or someone's direct a11y_engine_jobs SQL is full-scanning the Rails DB. Otherwise
-- report_id IS the scopeKey: skip this and go straight to TIMELINE.
-- created_at is DATETIME here — TIMESTAMP(...) literals fail (no-matching-signature).
-- The returned uuid is the EDS runId.
-- =============================================================================
SELECT id, uuid, report_id, report_type, proxy_map_path, created_at
FROM `browserstack-production.accessibility.rule_engine_runs_a11y`
WHERE created_at >= DATETIME('@SCAN_DATE') AND report_id = @REPORTID;

-- =============================================================================
-- RESOLVE --run-id  — map runId → scopeKey, then run TIMELINE on the result.
-- =============================================================================
SELECT DISTINCT
  COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scopeKey'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scopeKey')
  ) AS scopeKey
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @DAYS DAY)
  AND COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scanRunId'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scanRunId')
  ) = '@RUNID';

-- =============================================================================
-- DISCOVERY --user / --group / --url  — scan inventory grouped by scopeKey (NOT an autopsy).
-- user.user_id / user.group_id are TOP-LEVEL columns (no JSON path, no COALESCE).
-- Table is clustered by url, so --url is the cheapest pivot. State the LIMIT cap in output.
-- =============================================================================
WITH rows AS (
  SELECT
    created_at,
    COALESCE(
      JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scopeKey'),
      JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scopeKey')
    ) AS scopeKey,
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(kind, '$.arr')[SAFE_OFFSET(0)], '$.type') AS kind,
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(data, '$.arr')[SAFE_OFFSET(0)], '$.status') AS status,
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(url, '$.arr')[SAFE_OFFSET(0)], '$.url') AS url,
    user.user_id AS user_id, user.group_id AS group_id,
    ( /* paste the has_errors expression from TIMELINE */ ) AS has_errors
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @DAYS DAY)
    AND user.user_id = @USERID
    -- and/or: AND user.group_id = @GROUPID
    -- for --url: AND JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(url, '$.arr')[SAFE_OFFSET(0)], '$.url') LIKE '%@URLPATTERN%'
)
SELECT
  scopeKey,
  MIN(created_at) AS first_event, MAX(created_at) AS last_event, COUNT(*) AS events,
  STRING_AGG(DISTINCT kind ORDER BY kind) AS kinds_seen,
  COUNTIF(status = 'FAILURE') AS failures,
  COUNTIF(status = 'PARTIAL_SUCCESS') AS partials,
  COUNTIF(has_errors) AS error_rows,
  ANY_VALUE(group_id) AS group_id, ANY_VALUE(url) AS sample_url
FROM rows
WHERE scopeKey IS NOT NULL
GROUP BY scopeKey
ORDER BY last_event DESC
LIMIT 20;

-- =============================================================================
-- ERROR SPREAD --error <bucket-or-message-substring>  — prevalence across scans in window.
-- Headline = scans-affected; per-group breakdown is secondary. Exclude internal group IDs
-- (schema.md) when judging customer impact.
-- =============================================================================
SELECT
  user.group_id,
  COUNT(DISTINCT COALESCE(
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.scopeKey'),
    JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(product_metadata, '$.arr')[SAFE_OFFSET(0)], '$.productMetadata.scopeKey')
  )) AS scans,
  MIN(created_at) AS first_seen, MAX(created_at) AS last_seen,
  ANY_VALUE(JSON_EXTRACT_SCALAR(JSON_EXTRACT_ARRAY(url, '$.arr')[SAFE_OFFSET(0)], '$.url')) AS sample_url
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @DAYS DAY)
  AND TO_JSON_STRING(errors) LIKE '%@SIGNATURE%'
GROUP BY user.group_id
ORDER BY scans DESC
LIMIT 20;
