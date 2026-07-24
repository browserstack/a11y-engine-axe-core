# L2 Rule-Level Queries — check_errors + per-rule latency

## check_errors Structure (Top-Level!)

`errors.check_errors` is a **TOP-LEVEL** field in the errors JSON (NOT inside `$.arr`).
Each check is keyed by check function name, value is an array of error objects.

**Access pattern:** `JSON_EXTRACT(errors, '$.check_errors')` then `$.<check-name>`
**Count pattern:** `ARRAY_LENGTH(JSON_EXTRACT_ARRAY(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>'))`

Some checks have dual naming: `-check` AND `-evaluate` variants. Use `CASE WHEN` to cover both.

## B1 Check Errors Breakdown (ADVANCE_SCAN_RUN_WORKER kind)

Note: Check errors are reported in `ADVANCE_SCAN_RUN_WORKER` events even though they originate from B1 rule execution. B2 data collection includes B1 check error data.

```sql
-- Template for one check error column:
COALESCE(SUM(CASE
  WHEN JSON_EXTRACT(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>') IS NOT NULL
  THEN ARRAY_LENGTH(JSON_EXTRACT_ARRAY(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>'))
  ELSE 0
END), 0) AS errors_<check_alias>

-- For dual-named checks:
COALESCE(SUM(CASE
  WHEN JSON_EXTRACT(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>-evaluate') IS NOT NULL
  THEN ARRAY_LENGTH(JSON_EXTRACT_ARRAY(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>-evaluate'))
  WHEN JSON_EXTRACT(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>-check') IS NOT NULL
  THEN ARRAY_LENGTH(JSON_EXTRACT_ARRAY(JSON_EXTRACT(errors, '$.check_errors'), '$.<check-name>-check'))
  ELSE 0
END), 0) AS errors_<check_alias>
```

**Base query structure:**

```sql
SELECT DATE(s.created_at) AS date,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(data, '$.uuid')) AS total_scans,
  -- ... per-check columns ...
FROM `browserstack-production.a11y_engine.a11y_engine_stats_partitioned` s,
  UNNEST(JSON_EXTRACT_ARRAY(s.data, '$.arr')) AS data WITH OFFSET
  LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(s.errors, '$.arr')) AS errors WITH OFFSET USING(OFFSET)
  JOIN UNNEST(JSON_EXTRACT_ARRAY(s.kind, '$.arr')) AS kind WITH OFFSET USING(OFFSET)
WHERE s.created_at >= TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -6 DAY)
  AND s.created_at < TIMESTAMP_ADD(TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL -6 DAY), INTERVAL 7 DAY)
  AND (s.user.group_id NOT IN (2,1033726,3704971,4554271,5487005,6144900,6147012,6492988,6649924,6654525,6677773,6682333,6702515,8375933,9206715,9643879,10018759,10706572) OR s.user.group_id IS NULL)
  AND JSON_EXTRACT_SCALAR(kind, '$.type') = 'ADVANCE_SCAN_RUN_WORKER'
GROUP BY 1 ORDER BY 1 DESC
```

## Complete Check Error Names (50+)

### Single-name (use `-check` suffix)
autocomplete-attribute-valid-check, bypass-blocks-skip-links-check, distinguishable-link-check,
fieldset-missing-legend-check, label-empty-check, label-orphan-check, meaningful-sequence-check,
missing-fieldset-check, text-in-images-check, search-landmark-check, menu-landmark-check,
role-required-accessible-name-check, menu-expand-popup-check, menu-expand-check, menu-popup-check,
aria-expandable-region-check, carousel-region-check, missing-heading-check, missing-audio-transcript-check,
missing-lang-attribute-check, missing-text-description-check, image-alt-ai-check, role-required-check,
role-required-carousel, role-required-menu, placeholder-as-label-check, unnecessary-list-check,
breadcrumb-aria-current-check, breadcrumb-label-check, breadcrumb-landmark-check,
contentinfo-landmark-check, aria-required-check, dragging-movements-slider-check,
input-label-name-mismatch-check, aria-disabled-check

### Dual-name (try `-evaluate` then `-check`)
keyboard-accessible-role, meaningful-sequence-focus-order, meaningful-alt-text,
link-purpose, show-password, cognitive-captcha, cognitive-captcha-enhanced,
meaningful-alt-text-ai

### No-suffix
color-contrast, consistent-identification-links, consistent-navigation-layout,
consistent-navigation-relative-order, resize-2x-zoom, keyboard-focus-visible,
reflow-4x-zoom-scroll, non-text-control-contrast, decorative-image, missing-long-alt,
no-visible-label, pause-moving-content, accessible-name, accessible-name-carousel,
keyboard-interactive, keyboard-menu, pointer-gestures-carousel

### Data dumping checks (B2-specific)
consistent-identification-links-check, consistent-navigation-layout-check,
consistent-navigation-relative-order-check

## B2 Rule-Level Latency P90

**Latency path:** `latency.rules.<rule-name>.rule_<rule-name>` (nested twice!)
**Example:** `JSON_EXTRACT_SCALAR(JSON_EXTRACT(JSON_EXTRACT(latency, '$.rules'), '$.color-contrast'), '$.rule_color-contrast')`

### Exact P90 (for small counts, ≤ 10k samples)

```sql
CASE WHEN COUNT(CAST(val AS FLOAT64)) <= 10000
  THEN (ARRAY_AGG(CAST(val AS FLOAT64) IGNORE NULLS ORDER BY CAST(val AS FLOAT64) LIMIT 10000)
    [OFFSET(CAST(FLOOR(COUNT(CAST(val AS FLOAT64)) * 0.9 - 0.0000001) AS INT64))]
    + ARRAY_AGG(CAST(val AS FLOAT64) IGNORE NULLS ORDER BY CAST(val AS FLOAT64) LIMIT 10000)
    [OFFSET(CAST(FLOOR(COUNT(CAST(val AS FLOAT64)) * 0.9) AS INT64))]) / 2
  ELSE APPROX_QUANTILES(CAST(val AS FLOAT64), 1000)[OFFSET(900)]
END
```

## Rules Tracked for Latency (B1 in ADVANCE_SCAN_RUN_WORKER)

autocomplete-valid, bypass-blocks-skip-links, cognitive-captcha, cognitive-captcha-enhanced,
color-contrast, consistent-identification-links, consistent-navigation-layout,
consistent-navigation-relative-order, distinguishable-link, fieldset-missing-legend,
keyboard-accessible-role, label-empty, label-orphaned, link-purpose, meaningful-alt-text,
meaningful-sequence, meaningful-sequence-focus-order, missing-fieldset, resize-2x-zoom,
show-password, text-in-images, accessible-name, accessible-name-carousel, menu-landmark,
role-required-carousel, role-required-menu, search-landmark, role-required-accessible-name,
role-required, menu-expand, menu-expand-popup, menu-popup, keyboard-focus-visible,
aria-expandable-region, carousel-region, keyboard-interactive, keyboard-menu,
non-text-control-contrast, reflow-4x-zoom-scroll, meaningful-alt-text-ai, missing-heading,
decorative-image, missing-long-alt, no-visible-label, pause-moving-content,
missing-text-description, missing-lang-attribute, missing-audio-transcript,
placeholder-as-label, unnecessary-list, breadcrumb-aria-current, breadcrumb-label,
breadcrumb-landmark, contentinfo-landmark, aria-required, dragging-movements-slider,
input-label-name-mismatch, aria-disabled, pointer-gestures-carousel
