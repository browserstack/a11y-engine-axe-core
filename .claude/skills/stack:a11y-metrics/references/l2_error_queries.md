# L2 Error Queries

"[L2] AllyEngine Error Breakdown" dashboard — error summary, detailed buckets per scan type, uptime errors.

## Panels

1. Error Summary (all scan types)
2. SCAN_RUN (Type A) Error Buckets
3. ADVANCE_SCAN_RUN (Type B1) Error Buckets
4. ADVANCE_SCAN_RUN_WORKER (Type B2) Error Buckets
5. ASSET_CAPTURE Error Buckets
6. ADVANCE_SCAN_RUN_DOMFORGE (Type C) Error Buckets
7. ADVANCE_SCAN_RUN_AI + PRE/POSTPROCESS (Type AI + Headings) Error Buckets
8. Uptime Metric Collection Errors

## 1. Error Summary

Uses `JSON_VALUE(kind, '$.arr[0].type')` (index 0, no UNNEST) for efficiency.

```sql
WITH raw_data AS (
  SELECT
    JSON_VALUE(kind, '$.arr[0].type') AS kind_type,
    COALESCE(JSON_VALUE(product, '$.arr[0].name'), JSON_VALUE(product_metadata, '$.arr[0].name')) AS product_name,
    errors
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY), INTERVAL 3 DAY)
    AND JSON_VALUE(kind, '$.arr[0].type') IN (
      'SCAN_RUN','ADVANCE_SCAN_RUN','ADVANCE_SCAN_RUN_WORKER','ADVANCE_SCAN_RUN_DOMFORGE',
      'ADVANCE_SCAN_RUN_AI','ASSET_CAPTURE','POSTPROCESS_AI_HTML_WORKER','PREPROCESS_AI_HTML_WORKER')
),
scan_metrics AS (
  SELECT kind_type, product_name, COUNT(*) AS total_scans,
    COUNTIF(
      JSON_EXTRACT(errors, '$.arr') IS NOT NULL
      AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(errors, '$.arr')) > 0
      AND (
        -- Named buckets with non-empty arrays
        (SELECT COUNT(*) > 0
         FROM UNNEST(JSON_EXTRACT_ARRAY(errors, '$.arr')) AS error_obj,
              UNNEST(REGEXP_EXTRACT_ALL(TO_JSON_STRING(error_obj), r'"([^"]+)":\s*\[')) AS key_name
         WHERE key_name IN ('runtime_errors','server_errors','debug_errors','DOM_FORGE_CORE_ERROR','PERCY_RENDERER_ERROR','SCRIPT_DOWNLOAD_ERROR')
           AND NOT REGEXP_CONTAINS(TO_JSON_STRING(error_obj), CONCAT(r'"', key_name, r'":\s*\[\s*\{\s*\}\s*\]')))
        OR
        -- Uncategorized errors (direct error/message or stack-based)
        (SELECT COUNT(*) > 0
         FROM UNNEST(JSON_EXTRACT_ARRAY(errors, '$.arr')) AS error_obj
         WHERE ((JSON_EXTRACT_SCALAR(error_obj, '$.error') IS NOT NULL AND JSON_EXTRACT_SCALAR(error_obj, '$.message') IS NOT NULL)
                OR JSON_EXTRACT_SCALAR(error_obj, '$.stack.description') IS NOT NULL)
           AND ARRAY_LENGTH(REGEXP_EXTRACT_ALL(TO_JSON_STRING(error_obj), r'"([^"]+)":\s*\[')) = 0)
      )
    ) AS scans_with_errors
  FROM raw_data GROUP BY 1, 2
)
SELECT kind_type, SUM(total_scans) AS total_scans, SUM(scans_with_errors) AS scans_with_errors,
  ROUND(SAFE_DIVIDE(SUM(scans_with_errors), SUM(total_scans)) * 100, 2) AS failure_rate,
  ROUND(SAFE_DIVIDE(SUM(IF(product_name='WEBSITE_SCANNER', scans_with_errors, 0)), SUM(scans_with_errors)) * 100, 2) AS cs_split_pct,
  ROUND(SAFE_DIVIDE(SUM(IF(product_name='AUTOMATED_TESTS', scans_with_errors, 0)), SUM(scans_with_errors)) * 100, 2) AS aut_split_pct,
  ROUND(SAFE_DIVIDE(SUM(IF(product_name='WORKFLOW_ANALYSER', scans_with_errors, 0)), SUM(scans_with_errors)) * 100, 2) AS wa_split_pct
FROM scan_metrics GROUP BY kind_type ORDER BY total_scans DESC
```

**Key details:**

- Date range: 2 days back + 3 days forward (effectively ~3 days of data)
- No internal group_id exclusion (unlike L0/L1)
- Error detection uses REGEX to find named bucket keys in JSON
- Excludes empty bucket arrays `[{}]`

## 2. Error Buckets Detailed (per scan type)

Same template — differs only by `{KIND_FILTER}`:

- Type A: `JSON_VALUE(kind, '$.arr[0].type') = 'SCAN_RUN'`
- Type B1: `= 'ADVANCE_SCAN_RUN'`
- Type B2: `= 'ADVANCE_SCAN_RUN_WORKER'`
- Asset Capture: `= 'ASSET_CAPTURE'`
- Type C: `= 'ADVANCE_SCAN_RUN_DOMFORGE'`
- Type AI+Headings: `IN ('ADVANCE_SCAN_RUN_AI', 'POSTPROCESS_AI_HTML_WORKER', 'PREPROCESS_AI_HTML_WORKER')`

### Required JS UDFs (prefix query with these)

```sql
CREATE TEMP FUNCTION extractErrorArray(json_str STRING, key_name STRING)
RETURNS ARRAY<STRING>
LANGUAGE js AS r"""
  try {
    const obj = JSON.parse(json_str);
    if (obj && obj[key_name] && Array.isArray(obj[key_name])) {
      return obj[key_name].map(item => JSON.stringify(item));
    }
    return [];
  } catch (e) { return []; }
""";

CREATE TEMP FUNCTION normalize_error_message(error_msg STRING)
RETURNS STRING
LANGUAGE js AS r"""
  if (!error_msg) return null;
  let normalized = error_msg;
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]');
  normalized = normalized.replace(/\b\d{5,}\b/g, '[ID]');
  normalized = normalized.replace(/https?:\/\/[^\s]+/g, '[URL]');
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[Z\+\-\d:.]*/g, '[TIMESTAMP]');
  normalized = normalized.replace(/\b\d{10,}\b/g, '[UNIX_TS]');
  normalized = normalized.replace(/\/[a-zA-Z0-9_\-./]+\.(js|java|py|tsx|ts|go|rb|php)/g, '[FILE]');
  normalized = normalized.replace(/:\d+:\d+/g, ':[LINE]');
  normalized = normalized.replace(/0x[0-9a-f]+/gi, '[ADDR]');
  normalized = normalized.replace(/CurrentSelector Undefined in custom element .*/gi, 'CurrentSelector Undefined in custom element [SELECTOR]');
  normalized = normalized.replace(/status code 422.*?Parameter (result|data|errors|message|parameter)(?:\[[^\]]*\]){2,}\[([^\]]*)\] is required/gi, 'status code 422 Invalid parameters passed. Parameter [$2] is required');
  return normalized.trim();
""";
```

### Detailed Query Template

```sql
WITH raw_data AS (
  SELECT JSON_VALUE(kind, '$.arr[0].type') AS kind_type,
    COALESCE(JSON_VALUE(product, '$.arr[0].name'), JSON_VALUE(product_metadata, '$.arr[0].name')) AS product_name,
    errors
  FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY)
    AND _PARTITIONTIME < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY), INTERVAL 3 DAY)
    AND {KIND_FILTER}
),
error_items AS (
  -- Named buckets
  SELECT rd.kind_type, rd.product_name, key_name, TO_JSON_STRING(error_obj) as error_obj_str
  FROM raw_data rd, UNNEST(JSON_EXTRACT_ARRAY(rd.errors, '$.arr')) AS error_obj,
    UNNEST(REGEXP_EXTRACT_ALL(TO_JSON_STRING(error_obj), r'"([^"]+)":\s*\[')) AS key_name
  WHERE key_name IN ('runtime_errors','server_errors','debug_errors','DOM_FORGE_CORE_ERROR','PERCY_RENDERER_ERROR','SCRIPT_DOWNLOAD_ERROR')
  UNION ALL
  -- Uncategorized errors
  SELECT rd.kind_type, rd.product_name, 'uncategorized_errors', TO_JSON_STRING(error_obj)
  FROM raw_data rd, UNNEST(JSON_EXTRACT_ARRAY(rd.errors, '$.arr')) AS error_obj
  WHERE JSON_EXTRACT_SCALAR(error_obj, '$.error') IS NOT NULL
    AND JSON_EXTRACT_SCALAR(error_obj, '$.message') IS NOT NULL
    AND ARRAY_LENGTH(REGEXP_EXTRACT_ALL(TO_JSON_STRING(error_obj), r'"([^"]+)":\s*\[')) = 0
),
unnested_errors AS (
  SELECT kind_type, product_name, key_name AS error_bucket,
    CASE WHEN key_name = 'uncategorized_errors' THEN normalize_error_message(JSON_VALUE(error_item_str, '$.message'))
      WHEN JSON_VALUE(error_item_str, '$.message') IS NOT NULL THEN normalize_error_message(JSON_VALUE(error_item_str, '$.message'))
      WHEN JSON_VALUE(error_item_str, '$.stack.description') IS NOT NULL THEN normalize_error_message(JSON_VALUE(error_item_str, '$.stack.description'))
      ELSE '!! No message specified !!' END AS error_message,
    CASE WHEN key_name = 'uncategorized_errors' THEN normalize_error_message(COALESCE(REGEXP_EXTRACT(JSON_VALUE(error_item_str, '$.error'), r'^[^\n]+'), '!! No description specified !!'))
      WHEN JSON_VALUE(error_item_str, '$.error') IS NOT NULL THEN normalize_error_message(COALESCE(REGEXP_EXTRACT(JSON_VALUE(error_item_str, '$.error'), r'^[^\n]+'), '!! No description specified !!'))
      WHEN JSON_VALUE(error_item_str, '$.stack.code') IS NOT NULL THEN normalize_error_message(CONCAT(JSON_VALUE(error_item_str, '$.stack.code'),
        CASE WHEN JSON_EXTRACT_ARRAY(error_item_str, '$.stack.details') IS NOT NULL
          THEN CONCAT(': ', ARRAY_TO_STRING(JSON_VALUE_ARRAY(error_item_str, '$.stack.details'), ', ')) ELSE '' END))
      ELSE '!! No description specified !!' END AS error_detail
  FROM error_items,
    UNNEST(CASE WHEN key_name = 'uncategorized_errors' THEN [error_obj_str] ELSE extractErrorArray(error_obj_str, key_name) END) AS error_item_str
  WHERE JSON_VALUE(error_item_str, '$.message') IS NOT NULL OR JSON_VALUE(error_item_str, '$.stack.description') IS NOT NULL
),
error_agg AS (
  SELECT kind_type, error_bucket, error_message, error_detail, product_name, COUNT(*) AS error_count
  FROM unnested_errors GROUP BY 1,2,3,4,5
),
totals AS (SELECT kind_type, SUM(error_count) AS total FROM error_agg GROUP BY 1)
SELECT ea.error_bucket, ea.error_message, ea.error_detail,
  SUM(ea.error_count) AS total_occurrences,
  ROUND(SAFE_DIVIDE(SUM(ea.error_count), t.total) * 100, 2) AS pct_of_scan_type,
  SUM(IF(ea.product_name='WEBSITE_SCANNER', ea.error_count, 0)) AS cs,
  SUM(IF(ea.product_name='AUTOMATED_TESTS', ea.error_count, 0)) AS aut,
  SUM(IF(ea.product_name='WORKFLOW_ANALYSER', ea.error_count, 0)) AS wa
FROM error_agg ea JOIN totals t ON ea.kind_type = t.kind_type
GROUP BY 1,2,3,4, t.total ORDER BY total_occurrences DESC
```

## 3. Uptime Metric Collection Errors

```sql
SELECT
  JSON_EXTRACT_SCALAR(instrumentation_errors, '$.message') AS error_message,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(errors, '$.uuid')) AS error_count
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` s,
  UNNEST(JSON_EXTRACT_ARRAY(s.errors, '$.arr')) AS errors WITH OFFSET
  LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(errors, '$.instrumentation_errors')) AS instrumentation_errors
  JOIN UNNEST(JSON_EXTRACT_ARRAY(s.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
WHERE s.created_at >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY)
  AND s.created_at < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -2 DAY), INTERVAL 3 DAY)
  AND JSON_EXTRACT_SCALAR(kind, '$.type') = 'UPTIME_METRIC_COLLECTION'
GROUP BY 1 ORDER BY 2 DESC
```

## Error Buckets Reference

| Bucket                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `runtime_errors`         | Browser/JS runtime errors                            |
| `server_errors`          | Backend server errors                                |
| `debug_errors`           | Debug/diagnostic errors                              |
| `DOM_FORGE_CORE_ERROR`   | DOM Forge processing errors                          |
| `PERCY_RENDERER_ERROR`   | Percy rendering errors                               |
| `SCRIPT_DOWNLOAD_ERROR`  | Script download failures                             |
| `uncategorized_errors`   | Direct error/message objects without bucket wrapper  |
| `instrumentation_errors` | Uptime metric collection errors (separate structure) |

## normalize_error_message UDF — Purpose

Groups similar errors by stripping variable parts:

- UUIDs → `[UUID]`
- Numeric IDs (5+ digits) → `[ID]`
- URLs → `[URL]`
- Timestamps → `[TIMESTAMP]`
- File paths → `[FILE]`
- Line:column → `[LINE]`
- Memory addresses → `[ADDR]`
- Custom element selectors → `[SELECTOR]`
- 422 parameter paths → simplified
