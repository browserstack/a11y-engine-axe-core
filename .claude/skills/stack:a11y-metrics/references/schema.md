# a11y-engine BQ Schema

## Core Table
`browserstack-production.a11y_engine.a11y_engine_stats_partitioned`
- Partitioned by `_PARTITIONTIME` (DAY), clustered by `url`
- Top-level: `created_at` (TIMESTAMP), `user.group_id`, `user.user_id`

## Nested JSON Arrays (all use `$.arr` wrapper)

All complex fields stored as `{ arr: [...] }`. Joined positionally using `WITH OFFSET ... USING(OFFSET)` or `ON d_off = k_off`.

| Field | Key Sub-fields |
|---|---|
| `kind` | `type` (scan kind), `uuid` |
| `data` | `status` (SUCCESS/FAILURE/PARTIAL_SUCCESS), `uuid`, `violations[]`, `incomplete[]`, `passes[]`, `additionalData` |
| `latency` | `a11y_engine_scan`, `worker_latency`, `percy_exec_latency`, `totalTimeWithAssetUploading`, `dataCollectionLatencyWithAck`, `type_*_worker_wait_time`, `type_*_worker_queue_size`, `a11y_api_latency`, `domCaptureTime`, `resourceCaptureTime`, `rules.<rule>.rule_<rule>` |
| `product` | `name` (WEBSITE_SCANNER / AUTOMATED_TESTS / WORKFLOW_ANALYSER), `version` |
| `product_metadata` | `scanRunId`, `scopeKey`, `prioritized`, `testCaseId`, `runner` |
| `engine_run_config` | `a11yCoreConfig.isMobile` |
| `device_run_config` | `viewport.windowWidth`, `viewport.windowHeight`, `orientation.orientationType` |
| `engine_data` | `name`, `version` |
| `url` | `url` |
| `user_agent` | `user_agent` |
| `errors` | Buckets: `runtime_errors`, `server_errors`, `debug_errors`, `DOM_FORGE_CORE_ERROR`, `PERCY_RENDERER_ERROR`, `SCRIPT_DOWNLOAD_ERROR`; direct `error`/`message`/`stack` objects; top-level `check_errors` (NOT inside `arr`) |

## check_errors (special — top-level, not in `$.arr`)

`errors.check_errors` is a **top-level field** in the errors JSON. Keyed by check function name:
```
JSON_EXTRACT(errors, '$.check_errors') -> { "<check-name>": [{...}, {...}], ... }
```
Count: `ARRAY_LENGTH(JSON_EXTRACT_ARRAY(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>'))`

Some checks have both `-check` and `-evaluate` suffixes — try both with `CASE WHEN`.

## latency.rules (per-rule timing — nested twice!)

Path: `latency.rules.<rule-name>.rule_<rule-name>`
Example: `JSON_EXTRACT_SCALAR(JSON_EXTRACT(JSON_EXTRACT(latency, '$.rules'), '$.color-contrast'), '$.rule_color-contrast')`

## Scan Types (kind.type)

| Kind | Alias | L0 Latency Formula |
|---|---|---|
| `SCAN_RUN` | Type A | `a11y_engine_scan` |
| `ADVANCE_SCAN_RUN` | Type B1 | `a11y_engine_scan` |
| `ADVANCE_SCAN_RUN_WORKER` | Type B2 | `a11y_engine_scan` |
| `ADVANCE_SCAN_RUN_DOMFORGE` | Type C | `a11y_engine_scan + totalTimeWithAssetUploading` |
| `ADVANCE_SCAN_RUN_AI` | Type AI | `a11y_engine_scan` (multiple AI sub-latencies) |
| `POSTPROCESS_AI_HTML_WORKER` | Headings AI | `additionalData.a11yScanLatency` |
| `PREPROCESS_AI_HTML_WORKER` | Pre-AI HTML | `pre_process_ai_html_scan` |
| `ASSET_CAPTURE` | Asset Capture | `totalTimeWithAssetUploading` |
| `UPTIME_METRIC_COLLECTION` | Uptime (errors only) | N/A |

## Internal Group IDs to Exclude

```
(2, 1033726, 3704971, 4554271, 5487005, 6144900, 6147012, 6492988, 6649924, 6654525, 6677773, 6682333, 6702515, 8375933, 9206715, 9643879, 10018759, 10706572)
```

Canonical exclusion list — every query file mirrors it. **Keep it in sync with the Looker dashboard filters.** On drift (a dashboard suppresses a group the skill still counts → a breach the dashboard doesn't show), add the group here and to every mirror, **raise a PR, and share its link with the person who ran the skill.** (`9643879` = `bs-a11y-checks` synthetic monitor; added 2026-06-22 for parity.)

## External Tables

- `accessibility.rules_a11y` — rule definitions (code, engine_name, tags)
- `accessibility.issues_a11y` — issue/violation tracking
- `accessibility.test_runs_a11y` — test run lookup
- `accessibility.test_cases_a11y` — test case tracking
- `web_events.web_events_partitioned` — UI event tracking
