# Looker LookML Views for a11y-engine

## Repo

`https://github.com/browserstack/looker` — Views at `/Views/a11y-engine/`

Read a view file:

```bash
gh api "repos/browserstack/looker/contents/Views/a11y-engine/<file>.view.lkml" --jq '.content' | base64 -d
```

## By Category

### L0 Metrics

- `a11y_engine_l0_metrics_latency.view.lkml` — Weekly P90 latency per scan type (CS/WA P90 panels)

### L1 Metrics

- `a11y_engine_error_l1.view.lkml` — Daily success/failure/partial % per scan type per product
- `a11y_engine_latency_l1.view.lkml` — Daily P90 E2E latency per scan type per product

### Error Analysis

- `a11y_engine_error_buckets_summary.view.lkml` — Error rate with product splits (CS/AUT/WA)
- `a11y_engine_error_buckets_detailed.view.lkml` — Granular error categorization per bucket

### Scan Type Deep-Dives

- `a11y_engine_type_c.view.lkml` — Type C (DOMFORGE) latency, status, P90/P75
- `a11y_engine_type_ai.view.lkml` — Type AI latency, image counts, success rate
- `a11y_engine_type_c_lifecycle.view.lkml` — Type C pipeline stages (asset_capture → proxy_map → result)
- `a11y_engine_type_c_accuracy.view.lkml` — Asset capture success rate
- `a11y_engine_type_c_drop.view.lkml` — Type C drop-off analysis
- `a11y_engine_type_c_scan_trend.view.lkml` — Type C volume trends

### AI Workers

- `a11y_engine_postprocess_ai_html_worker.view.lkml` — Headings AI post-processing metrics
- `a11y_engine_preprocess_ai_html_worker.view.lkml` — Headings AI pre-processing metrics

### E2E Trace

- `a11y_engine_falcon.view.lkml` — Comprehensive scan execution trace (all phases)
- `a11y_engine_falcon_latency.view.lkml` — Detailed latency breakdown across all types

### Coverage & Rules

- `a11y_engine_coverage_count.view.lkml` — WCAG rule pass/fail/needs-review counts (50+ rules)
- `a11y_engine_wcag22aa_rule_count.view.lkml` — Count of WCAG 2.2 AA rules
- `a11y_engine_unique_urls_with_rule_violation.view.lkml` — URLs with specific rule violations

### Adoption & Usage

- `a11y_engine_user_at_adoption.view.lkml` — Per-user adoption
- `a11y_engine_group_at_adoption.view.lkml` — Per-group adoption
- `a11y_engine_at_adoption_awareness_metrics.view.lkml` — Adoption/awareness metrics
- `a11y_engine_at_drop_midway.view.lkml` — Mid-scan abandonment
- `a11y_engine_at_drop_unsaved_report.view.lkml` — Unsaved reports

### Other

- `a11y_engine_stats_partitioned.view.lkml` — Base table definition with all dimensions
- `a11y_engine_advance_issues_view_analysis.view.lkml` — Correlation with web_events
- `a11y_engine_needs_review_and_passes_count.view.lkml`
- `a11y_engine_reports_with_atleast_xx_violations.view.lkml`
- `a11y_engine_unique_scope_key_ids.view.lkml`
- `a11y_engine_interval_scan_count.view.lkml`
- `a11y_engine_hide_issues.view.lkml`
- `a11y_engine_at_scan_latency.view.lkml`
