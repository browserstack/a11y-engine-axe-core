# Breach Thresholds and Investigation Workflow

## L0 Breach Thresholds

**Evaluation windows differ per metric — do not unify them:**

- **Engine Run Failure %** — previous full UTC day (yesterday). Single-day failure rate.
- **All latency P90 panels (AUT / CS OnDemand / WA)** — current week starting Monday → now (week-to-date). The L0 Looker dashboard groups these by `Scan Week (starting Monday)`; the P90 used for breach calls is computed over that week-to-date window, not a single day.

Always label the window in user-facing output (e.g. "Failures: 2026-05-13" + "Latency: Week of 2026-05-11 → today").

| Metric | Threshold | Breach When | Window |
|---|---|---|---|
| Engine Run Failure % | **3%** | > 3% | Yesterday (single day) |
| Type A P90 (all products) | 5,000 ms | > 5,000 ms | Week-to-date |
| AUT Asset Capture Latency P90 | 25,000 ms | > 25,000 ms | Week-to-date |
| AUT Type B Data Collection P90 | 14,000 ms | > 14,000 ms | Week-to-date |
| CS OnDemand Max(Type B1, C) P90 | 80,000 ms | > 80,000 ms | Week-to-date |
| CS OnDemand Type B2 P90 | 80,000 ms | > 80,000 ms | Week-to-date |
| CS OnDemand MAX(Type AI, Headings) P90 | 80,000 ms | > 80,000 ms | Week-to-date |
| WA Max(Type B1, C) P90 | 80,000 ms | > 80,000 ms | Week-to-date |
| WA Type B2 P90 | 80,000 ms | > 80,000 ms | Week-to-date |
| WA MAX(Type AI, Headings) P90 | 80,000 ms | > 80,000 ms | Week-to-date |

**Note on CS**: CS metrics are for **OnDemand scans only** — filter `product.name='WEBSITE_SCANNER' AND product_metadata.prioritized='true'`. Non-prioritized (background) CS scans are excluded from L0.

## AT errors Breach Thresholds (Assisted Tests)

User-facing label is **"AT errors"** (not "AT L0"). Reported as a peer to scanner L0/L1 in the same Slack message and canvas TL;DR. Single metric: **non-timeout error rate rise**. Full query + formula in `references/at_l0_queries.md`.

| Metric | Threshold | Breach When |
|---|---|---|
| Non-timeout error % (today vs 7-day median) | +2pp absolute **OR** 2× relative | `today_pct > median + 2.0` OR `today_pct > 2 * median` |
| Low-volume modifier (dynamic) | `today_runs < 0.3 × 7-day median(total_runs)` | Demotes 🔴 → ⚠️ ("errors may be discounted, volume low"). Never skips the report. |

Numbers are always reported regardless of volume — the low-volume flag only changes the narration (🔴 becomes ⚠️ when sample size is too small to trust the rate). Timeouts (`%timed out%` / `%timeout%`) are user-driven (20-min idle abandon in `assistedTestsHandler.js`) — informational only, never breach. Looker: https://browserstack.looker.com/dashboards/2976. AT L1/L2 are out of scope for now.

## L1 Breach Thresholds (Red only — Yellow band omitted per reporting convention)

L1 breaches are evaluated per **product × scan type** across three dimensions: Failure %, E2E P90 latency, and Partial Success %. Anything below is **Red (breach)**. CS is split into OnDemand (SLA-bound, inherits L0 latency override) and Background.

**Reporting rule:** Apply these thresholds silently — do **not** restate or explain the threshold values in the L1 analysis output. Only call out the breaching metric and its observed value.

### Type A (all products)
Fallback to L0: **P90 > 5,000ms**. No per-product / per-track variation.

### Workflow Analyser

| Scan Type | Failure % | P90 | Partial Success % |
|---|---|---|---|
| Type B1 | > 15% | > 25 sec | > 2% |
| Type B2 | > 2%  | > 5 min  | > 1% |
| Type C  | > 15% | > 5 min  | > 1% |
| Type AI | > 2%  | > 5 min  | > 5% |

### Website Scanner — CS OnDemand (`product_metadata.prioritized = 'true'`)

SLA-bound. **B1/C latency uses L0 override**: `Max(Type B1 P90, Type C P90) > 80,000ms`.

| Scan Type | Failure % | P90 | Partial Success % |
|---|---|---|---|
| Type B1 | > 2% | *(covered by Max(B1,C) > 80s)* | > 1% |
| Type B2 | > 3% | > 5 min  | > 2% |
| Type C  | > 2% | *(covered by Max(B1,C) > 80s)* | > 1% |
| Type AI | > 2% | > 20 min | > 5% |

### Website Scanner — CS Background

| Scan Type | Failure % | P90 | Partial Success % |
|---|---|---|---|
| Type B1 | > 2% | > 10 min | > 1% |
| Type B2 | > 3% | > 5 min  | > 2% |
| Type C  | > 2% | > 10 min | > 1% |
| Type AI | > 2% | > 20 min | > 5% |

### Automated Tests

| Scan Type | Failure % | P90 | Partial Success % |
|---|---|---|---|
| Type B1 | > 2% | > 10 min | > 1% |
| Type B2 | > 2% | > 5 min  | > 1% |
| Type C  | > 5% | > 15 min | *Yellow only: > 1% — informational, not a breach* |
| Type AI | > 2% | > 10 min | > 5% |

## Investigation Workflow

### Step 1 — L0 Weekly Trends
- Weekly L0 metrics for trends
- Identify breaching metrics (latency thresholds, failure %)
- Compare current week to prior weeks

### Step 2 — L1 Drill-Down (if L0 breached)
- Break down by product (CS/AUT/WA) and scan type (A/B1/B2/C/AI/Headings AI)
- Flag success < 95% as critical, 95-98% as warning

### Step 3 — L1 Current Day Independent Check
- Always check today's L1 independently (regardless of L0)
- Call out any scan type × product with success < 95% or in the 95-98% band

### Step 4 — L2 Drill-Down (for problematic L1)
- Error bucket breakdown (which error types dominate)
- Error breakdown per rule (which rules cause PARTIAL_SUCCESS)
- Rule-level latency (which rules are slow)
- Specific error messages (root cause)

### Step 5 — Group / User Attribution
- For failures/errors, check if concentrated in specific groups or users
- Query by group_id to find top error-producing groups
- Determine if systemic issue or customer-specific

### Attribution Query Pattern

```sql
-- Top groups by failure count for a specific scan type
SELECT s.user.group_id, COUNT(*) AS failure_count
FROM ... WHERE status = 'FAILURE' AND kind_type = '{TYPE}'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20

-- Top users within a problematic group
SELECT s.user.user_id, COUNT(*) AS failure_count
FROM ... WHERE status = 'FAILURE' AND s.user.group_id = {GROUP_ID}
GROUP BY 1 ORDER BY 2 DESC LIMIT 20

-- Groups driving the P99 tail of a latency metric
SELECT s.user.group_id, COUNT(*) AS tail_events, ROUND(AVG(latency_ms)) AS avg_tail_ms
FROM ... WHERE latency_ms >= {p99_threshold_ms}
GROUP BY 1 ORDER BY 2 DESC LIMIT 25
```
