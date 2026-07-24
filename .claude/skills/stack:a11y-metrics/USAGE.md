# a11y-metrics — BigQuery investigation skill for the a11y-engine

Team-shareable overview. For the internal decision-tree and queries, see `SKILL.md` and `references/`.

---

## What it is

A Claude Code skill that turns plain-English questions about a11y-engine health into a full BigQuery investigation. Instead of hand-writing JSON-unnest queries against `a11y_engine_stats_partitioned`, you ask "analyse yesterday's L0" and get a complete L0 → L1 → L2 → group-attribution report with known-signature diagnosis and code-level fix pointers.

Lives in the repo at `.claude/skills/stack:a11y-metrics/` (project-level, checked into the `a11y-engine-2` codebase — everyone on this repo gets it automatically).

## What it does

Given any L0 question, it autonomously runs **8 phases** in one go:

1. **TL;DR** — 5-bullet summary: L0 status, watchlist, L1 critical, top error driver, actions. Internal signature IDs (S1, S2, …) are consulted but never exposed in user-facing output.
2. **L0 snapshot** — mirrors the L0 dashboard's 4 panels: Engine Run Failures, AUT P90 (Client Side), CS OnDemand P90, WA P90. Thresholds applied (3% failures, 80s CS OnDemand Max(B1,C), 25s AUT Asset Cap, 14s AUT B Data Coll, 5s Type A).
3. **L1 drill-down** — success/partial/failure % per product track × scan type. User-facing output shows **🔴 critical only** (< 95%); CS OnDemand rows are excluded (they belong in L0).
4. **L2 error summary** — error rate by scan type with per-product splits.
5. **L2 detailed + inner-error drill-down** — top error messages excluding ASSET_CAPTURE + B1 debug_errors. When a single message dominates a bucket, unnests `.error` (Phase 4c) — works for B1 "Runtime Error while collecting data for type B" since `.error` is populated. ASSET_CAPTURE and B1 debug surface in dedicated sub-sections at the end of L2.
6. **Group attribution** — top failure groups and top latency-tail groups.
7. **Findings + JIRA-tracked Fixes table** — each fix gets a row with JIRA link, status, priority, assignee. Searches JIRA first; creates a new ticket assigned to OPS if missing. "Watch X tomorrow" notes are internal-only and excluded from the Fixes table.
8. **Slack message + Canvas posting** (when asked) — slim TL;DR+L0+L1 reply to the thread, plus a Slack Canvas with full L0/L1/L2/groups/fixes carrying ✅ / 🟡 / 🔴 markers.

Ends with a `### Learnings for memory` block so patterns accumulate across runs.

## Key design choices the team should know

- **CS is always split into OnDemand vs Background.** L0 thresholds apply to OnDemand only (SLA-bound). Background is reported for context. Filter: `product_metadata.prioritized = 'true'` = OnDemand.
- **One table, always**: `browserstack-production.a11y_engine.a11y_engine_stats_partitioned`. No detours to Percy/dom-forge/MySQL — the a11y-engine emits its own EDS measurements.
- **Internal groups auto-excluded** (16 group IDs). Override by asking explicitly.
- **Known signatures catalog** (`references/signatures.md`) — 7 error shapes and 3 attribution patterns. The skill consults it before root-causing; if a match, it cites the signature and skips to the pre-identified next step.
- **Failure threshold is 3%** (updated from the stale 0.05%).

## How to use it

**Prerequisites:**

- Claude Code installed (CLI or desktop app)
- `bq` CLI authenticated to `browserstack-production` (test with: `bq query --project_id=browserstack-production --nouse_legacy_sql 'SELECT 1'`)
- You're working inside the `a11y-engine-2` repo (so the skill loads)

**Invoke:**

Just type the slash command with a natural-language argument.

```
/a11y-metrics analyse yesterday's L0
/a11y-metrics L0 metric analysis for 13th April
/a11y-metrics is the engine healthy today?
/a11y-metrics P99 percy exec latency last 7 days
/a11y-metrics who is driving CS Type C latency
/a11y-metrics check errors per rule this week
/a11y-metrics create a daily L0 routine that posts to Slack at 10:45 IST
/a11y-metrics check if my L0 routine is up to date with the skill
```

The skill picks the right reference internally. For an L0 question, it runs the full 7-phase workflow. For a single-metric question (e.g. "P99 percy exec latency"), it runs just what you asked.

**Time budget:** a full L0 run is ~2–4 min of BigQuery compute (most phases run in parallel). A targeted single-metric query is 5–30s.

## What it's good for

- Daily L0 health checks
- Breach investigations ("what broke yesterday?")
- Customer attribution ("who's driving this error?")
- Latency drill-downs for any of the 10+ known latency fields
- Error-message root causing (with file:line references)
- Rule-level analysis via `check_errors` + per-rule P90
- **Scheduled, unattended daily reports** — `references/l0_routine.md` sets up a Claude Code cloud routine that runs the full L0 workflow on a cron and auto-posts to Slack (BigQuery + Slack via MCP, no local machine needed), and a manifest-based drift check that re-syncs the routine when the skill's queries change

## What it's NOT for

- Real-time alerting (it's on-demand or scheduled; for sub-minute alerting wire up Datadog/Sentry). The scheduled cloud routine (`l0_routine.md`) covers daily unattended reporting, not threshold-triggered paging.
- Pre-ingestion debugging (it reads what EDS delivered to BQ; upstream data loss is invisible here)
- Cross-product metrics outside a11y-engine (use `Views/automate/`, `Views/live/`, etc. directly)

## How to contribute

The skill gets better with every investigation. Three ways to contribute:

1. **Add a known signature** — edit `.claude/skills/stack:a11y-metrics/references/signatures.md`. Rule: confirm the pattern across ≥2 separate days first. Each entry is Shape → Diagnosis → Next step.
2. **Update a threshold** — edit `references/breach_thresholds.md` and note the change reason.
3. **Add a new latency field** — edit `references/schema.md` and the `SKILL.md` latency-fields table.

All changes are tracked in git — PR into the repo like any other change.

## File structure (for reviewers)

```
.claude/skills/stack:a11y-metrics/
├── SKILL.md                         (entry point, decision tree, rules)
├── USAGE.md                         (this doc — team-facing overview)
└── references/
    ├── l0_full_workflow.md          (L0 autonomous runbook, 7 phases)
    ├── l0_routine.md                (create the scheduled L0 cloud routine)
    ├── signatures.md                (S1-S7, A1-A3, C1 diagnostic catalog)
    ├── breach_thresholds.md         (thresholds + investigation workflow)
    ├── schema.md                    (nested JSON shape + scan types)
    ├── l1_queries.md                (L1 status + latency, with CS track split)
    ├── l2_error_queries.md          (L2 error buckets + UDFs)
    ├── l2_rule_queries.md           (check_errors + per-rule P90)
    ├── eds_data_flow.md             (code → EDS → BQ mapping)
    └── looker_views.md              (32 LookML views cross-reference)
```

## Token consumption (Claude context budget)

The skill tries to keep context footprint low so you can run multiple investigations per session before hitting compaction. `bq --format=csv` is the default and roughly halves query-result tokens vs `pretty`. Numbers below are approximate; actual consumption varies with result-row count and whether subagents are spawned.

### What eats tokens

| Component | Typical cost | Notes |
|---|---|---|
| SKILL.md load (every invocation) | ~1.1k | Always-on cost |
| Reference file (loaded on demand) | 600 – 3.8k | `l0_full_workflow.md` is the largest (~3.8k); `schema.md`, `eds_data_flow.md` are <1k |
| SQL query in conversation (heredoc + bq command) | 0.5 – 2k per query | Longer for L0 latency queries with multi-CTE |
| BigQuery CSV result in tool output | ~5 – 20 tokens/row | A 25-row × 6-col detail table is ~1.5k |
| Markdown table in final response | ~50 – 100 tokens/row | Wide tables with long error-message columns eat more |
| Subagent spawn (e.g. `a11y-backend` root-causing) | +15 – 25k per agent | Each agent loads its own context; heaviest single cost |

### Typical costs by operation

| Operation | Example argument | Approx tokens | Notes |
|---|---|---|---|
| Single scalar (1 row) | `/a11y-metrics failures yesterday` | **~2 – 3k** | SKILL.md + 1 small query + 1-row result |
| Single-metric latency | `/a11y-metrics P99 percy exec latency last 7 days` | **~4 – 5k** | + `schema.md` + ~25-row result |
| Attribution query | `/a11y-metrics who is driving CS Type C latency` | **~5 – 7k** | 2 queries (volume + tail) + ~15-row results each |
| Rule-level analysis | `/a11y-metrics check errors per rule this week` | **~7 – 9k** | `l2_rule_queries.md` + weekly aggregate + daily trend |
| Schema / version enumeration | `/a11y-metrics unique a11y-engine versions last 4 months` | **~3 – 5k** | Long time-range but simple aggregate → ~70-row result |
| Targeted L2 drill | `/a11y-metrics L2 error buckets for yesterday CS` | **~8 – 12k** | `l2_error_queries.md` (UDFs) + detailed table |
| **Full L0 workflow** | `/a11y-metrics analyse yesterday's L0` | **~10 – 16k** | All 7 phases in one run (post-CSV optimisation; was 18-25k before) |
| L0 on incident day (more data) | `/a11y-metrics analyse 14th April L0` (21% failure day) | **~15 – 20k** | Larger result tables, more signature matches |
| L0 + root-cause investigation | L0 + spawn `a11y-backend`/`a11y-frontend` subagents | **~35 – 55k** | +15-25k per subagent spawned |
| Multi-day trending / forensic audit | `/a11y-metrics how has color-contrast check errors trended last 14 days` | **~8 – 12k** | One query with per-day rows; pipe-to-file if >100 rows |

### Observed session sizes (real examples from recent runs)

- **Yesterday's L0 (2026-04-16)** — healthy day, 2 breaches: ~12k tokens for the full workflow.
- **April 14 L0** — 21% failure incident day, 16k Headings AI errors: ~18k tokens.
- **April 13 L0** — clean day, no breaches: ~11k tokens.
- **March 29 L0** — Asset Cap 413 burst day: ~13k tokens (CSV-optimised).
- **Percy P99 latency + group tail drill** — 7-day window: ~6k tokens.
- **Unique versions last 4 months** — 70-row aggregate: ~4k tokens.
- **L0 + error investigation with both frontend + backend subagents** (April 16 session): ~60k tokens.

### Context window reach

At Opus 4.7 (1M context) you can run effectively unlimited investigations per session. At standard 200k context:

- ~15 full L0 runs before compaction (at ~12k each)
- ~3 full investigations with subagents before compaction (at ~55k each)
- After compaction, older turns are summarised — new runs start fresh against the summary

### Reducing footprint further

If you need to squeeze more investigations into one session:

- **Stick to single-metric queries** when you only want one number. Don't invoke the full L0 workflow if you just want to know "what's CS OnDemand's P90 today?"
- **Use `--format=csv`** (already the default — don't override to `pretty` unless you need the raw box-drawn output for a paste).
- **Pipe large result sets to file**: `bq query ... > /tmp/out.csv && head -20 /tmp/out.csv`. Useful when the result is >100 rows.
- **Scope to one scan type / one product track** when possible — narrower queries produce narrower results.
- **Avoid re-running L0 within the same session** — ask me to summarise the previous run instead of re-querying.

## Caveats worth calling out

- **BigQuery cost**: a full L0 run scans 2 days of partitions with multiple JSON UDFs. Not cheap — prefer single-day ranges, not rolling 30-day.
- **Dashboard parity**: queries match the LookML-defined dashboards but the skill's CS OnDemand/Background split diverges from the old "CS" aggregate. Numbers won't match the legacy dashboard byte-for-byte until LookML is updated.
- **Signature catalog is a living doc**: an entry existing doesn't mean the underlying bug is fixed — it means we know the shape. Check the "first seen" date.

## Questions

Open a PR against `.claude/skills/stack:a11y-metrics/` with suggested changes.
