# L1 Dashboard Queries

Error status distribution and E2E latency P90 by scan type, per product, daily.

**IMPORTANT:** For `WEBSITE_SCANNER` (CS), always split into two tracks — **CS OnDemand** (`product_metadata.prioritized = 'true'`) and **CS Background** (all others). These have different SLAs and different usage patterns. AUT and WA remain single tracks.

## 1. L1 Error Status (Daily, per product track, per scan type)

Deduplicates by `scan_run_id + kind_type`, keeping worst status (FAILURE > PARTIAL_SUCCESS > SUCCESS). Splits CS by `product_metadata.prioritized`.

```sql
WITH extracted_data AS (
  SELECT
    DATE(stats.created_at) AS created_date,
    JSON_EXTRACT_SCALAR(data, '$.uuid') AS scan_run_id,
    JSON_EXTRACT_SCALAR(data, '$.status') AS status,
    JSON_EXTRACT_SCALAR(kind, '$.type') AS kind_type,
    JSON_EXTRACT_SCALAR(product, '$.name') AS product_name,
    JSON_EXTRACT_SCALAR(product_metadata, '$.prioritized') AS prioritized
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` AS stats,
    UNNEST(JSON_EXTRACT_ARRAY(stats.data, '$.arr')) AS data WITH OFFSET
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.product, '$.arr')) AS product WITH OFFSET USING(OFFSET)
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.product_metadata, '$.arr')) AS product_metadata WITH OFFSET USING(OFFSET)
  WHERE stats._PARTITIONTIME >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -7 DAY)
    AND stats._PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -7 DAY), INTERVAL 7 DAY)
    AND NOT (stats.user.group_id IN (2,6147012,8375933,1033726,6649924,6144900,4554271,6702515,5487005,6677773,6654525,3704971,6682333,6492988,9206715,9643879,10018759,10706572))
    AND JSON_EXTRACT_SCALAR(product, '$.name') IN ('WEBSITE_SCANNER','AUTOMATED_TESTS','WORKFLOW_ANALYSER')
    AND JSON_EXTRACT_SCALAR(kind, '$.type') IN ('SCAN_RUN','ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_DOMFORGE','ADVANCE_SCAN_RUN_AI','POSTPROCESS_AI_HTML_WORKER')
),
classified AS (
  SELECT *,
    CASE
      WHEN product_name = 'WEBSITE_SCANNER' AND prioritized = 'true' THEN 'CS OnDemand'
      WHEN product_name = 'WEBSITE_SCANNER' THEN 'CS Background'
      WHEN product_name = 'AUTOMATED_TESTS' THEN 'AUT'
      WHEN product_name = 'WORKFLOW_ANALYSER' THEN 'WA'
    END AS product_track
  FROM extracted_data
),
status_ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY scan_run_id, kind_type
    ORDER BY CASE WHEN status='FAILURE' THEN 1 WHEN status='PARTIAL_SUCCESS' THEN 2 WHEN status='SUCCESS' THEN 3 ELSE 4 END
  ) AS rn
  FROM classified
),
deduplicated AS (SELECT * FROM status_ranked WHERE rn = 1)
SELECT
  product_track,
  CASE
    WHEN kind_type = 'SCAN_RUN' THEN 'Type A'
    WHEN kind_type = 'ADVANCE_SCAN_RUN' THEN 'Type B1'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_WORKER' THEN 'Type B2'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_DOMFORGE' THEN 'Type C'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_AI' THEN 'Type AI'
    WHEN kind_type = 'POSTPROCESS_AI_HTML_WORKER' THEN 'Type HEADINGS AI'
  END AS kind_label,
  created_date,
  COUNT(DISTINCT scan_run_id) AS total_scans,
  ROUND(100 * COUNTIF(status='SUCCESS') / NULLIF(COUNT(*), 0), 2) AS success_pct,
  ROUND(100 * COUNTIF(status='PARTIAL_SUCCESS') / NULLIF(COUNT(*), 0), 2) AS partial_pct,
  ROUND(100 * COUNTIF(status='FAILURE') / NULLIF(COUNT(*), 0), 2) AS failure_pct
FROM deduplicated
GROUP BY product_track, kind_type, kind_label, created_date
ORDER BY product_track, created_date DESC, kind_label
```

**Key details:**
- `product_track` has 4 values: `CS OnDemand`, `CS Background`, `AUT`, `WA`
- `prioritized` is a STRING ("true" / "false") — always compare as string
- Deduplication: same scan_run_id + kind_type → keep worst status
- ~62s for all 3 products, 7-day window

## 2. L1 E2E Latency P90 (Daily, per product, per scan type)

E2E latency formula:
- `POSTPROCESS_AI_HTML_WORKER`: `additionalData.a11yScanLatency`
- Others with `a11y_engine_scan > 0`: `a11y_engine_scan + totalTimeWithAssetUploading + dataCollectionLatencyWithAck`
- Others with `a11y_engine_scan = 0`: fallback to `worker_latency`

```sql
WITH extracted_data AS (
  SELECT
    DATE(stats.created_at) AS created_date,
    JSON_EXTRACT_SCALAR(data, '$.uuid') AS scan_run_id,
    JSON_EXTRACT_SCALAR(kind, '$.type') AS kind_type,
    JSON_EXTRACT_SCALAR(product, '$.name') AS product_name,
    CASE WHEN JSON_EXTRACT_SCALAR(kind, '$.type') = 'POSTPROCESS_AI_HTML_WORKER'
      THEN SAFE_CAST(JSON_EXTRACT_SCALAR(data, '$.additionalData.a11yScanLatency') AS FLOAT64)
      WHEN CAST(JSON_EXTRACT_SCALAR(latency, '$.a11y_engine_scan') AS FLOAT64) > 0
        THEN COALESCE(CAST(JSON_EXTRACT_SCALAR(latency, '$.a11y_engine_scan') AS FLOAT64), 0)
          + COALESCE(CAST(JSON_EXTRACT_SCALAR(latency, '$.totalTimeWithAssetUploading') AS FLOAT64), 0)
          + COALESCE(CAST(JSON_EXTRACT_SCALAR(latency, '$.dataCollectionLatencyWithAck') AS FLOAT64), 0)
        ELSE COALESCE(CAST(JSON_EXTRACT_SCALAR(latency, '$.worker_latency') AS FLOAT64), 0)
    END AS latency
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` AS stats,
    UNNEST(JSON_EXTRACT_ARRAY(stats.data, '$.arr')) AS data WITH OFFSET
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.product, '$.arr')) AS product WITH OFFSET USING(OFFSET)
    LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(stats.latency, '$.arr')) AS latency WITH OFFSET USING(OFFSET)
  WHERE stats._PARTITIONTIME >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -7 DAY)
    AND stats._PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -7 DAY), INTERVAL 7 DAY)
    AND NOT (stats.user.group_id IN (2,6147012,8375933,1033726,6649924,6144900,4554271,6702515,5487005,6677773,6654525,3704971,6682333,6492988,9206715,9643879,10018759,10706572))
    AND JSON_EXTRACT_SCALAR(product, '$.name') IN ('WEBSITE_SCANNER','AUTOMATED_TESTS','WORKFLOW_ANALYSER')
    AND JSON_EXTRACT_SCALAR(kind, '$.type') IN ('SCAN_RUN','ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_DOMFORGE','ADVANCE_SCAN_RUN_AI','POSTPROCESS_AI_HTML_WORKER')
),
deduplicated AS (
  SELECT scan_run_id, kind_type, product_name, MAX(latency) AS max_latency, ANY_VALUE(created_date) AS created_date
  FROM extracted_data
  GROUP BY scan_run_id, kind_type, product_name
)
SELECT
  product_name,
  CASE
    WHEN kind_type = 'SCAN_RUN' THEN 'Type A'
    WHEN kind_type = 'ADVANCE_SCAN_RUN' THEN 'Type B1'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_WORKER' THEN 'Type B2'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_DOMFORGE' THEN 'Type C'
    WHEN kind_type = 'ADVANCE_SCAN_RUN_AI' THEN 'Type AI'
    WHEN kind_type = 'POSTPROCESS_AI_HTML_WORKER' THEN 'Type HEADINGS AI'
  END AS kind_label,
  created_date,
  ROUND(APPROX_QUANTILES(max_latency, 100)[OFFSET(90)], 2) AS p90_latency_ms
FROM deduplicated
GROUP BY product_name, kind_type, kind_label, created_date
ORDER BY product_name, created_date DESC, kind_label
```

**Key difference from L0 latency:**
- L0 uses type-specific formulas (Type C = `a11y_engine_scan + totalTimeWithAssetUploading` only)
- L1 E2E adds ALL components: `a11y_engine_scan + totalTimeWithAssetUploading + dataCollectionLatencyWithAck`
- L1 falls back to `worker_latency` when `a11y_engine_scan` is 0
- ~75s for all 3 products, 7-day window
