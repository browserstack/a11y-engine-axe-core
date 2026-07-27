---
name: stack:ops-autopsy
description: "Read-only per-scan ops autopsy for a11y-engine (Spectra). Resolves any handle on a scan — scopeKey, report-id, run-id, or user/group/url/error-signature pivots — into a lifecycle verdict: lane timeline (A/B1/B2/C/AI/asset-capture) from EDS in BigQuery, inferred blocked EOF gate, error buckets, and exact CG (Chitragupta) log signatures. Diagnostic only; the one optional write is a Slack reply. Boundary: aggregate dashboards / L0-L1-L2 trends → stack:a11y-metrics; Zenduty alert triage + deploy correlation → stack:debug-alert. Triggers: 'ops autopsy', 'check scopeKey', 'why is this scan stuck', 'eof not received', 'snapshots missing for scan', '0 issues scan', 'check scans for user/group/site X', 'how frequent is this error', 'resolve report-id', 'resolve run-id'."
argument-hint: '<scopeKey> [<scopeKey>...] | --report-id <id> | --run-id <uuid> | --user <userId> | --group <groupId> | --url <host> | --error <signature> [--days N] [--post <slack-thread-url>]'
allowed-tools:
  [
    Read,
    Glob,
    Grep,
    Bash(bq:*),
    Bash(date:*),
    mcp__elasticsearch__search,
    mcp__claude_ai_Slack__slack_read_thread,
    mcp__claude_ai_Slack__slack_send_message
  ]
---

# stack:ops-autopsy — per-scan ops query desk for a11y-engine (Spectra)

Turn any handle on a scan into a verdict: reconstruct the lane timeline from **EDS events in
BigQuery** (every lane emits a distinct `kind`), infer which EOF gate stalled — gate state is
_inferred_ from which lanes reported, no prod Redis needed — and hand the on-call exact
**CG (Chitragupta) log signatures** (2-week server-log retention). Every entry point funnels
into that per-scan autopsy.

**Scope — hand off, don't widen:**

| Query                                                                                                                                  | Skill                |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| "check scopeKey X", stuck/EOF-delayed build, 0-issue scan, missing snapshots, "scans for user/group/site X", "how often is this error" | **this skill**       |
| p90/p99, failure-rate trend, L0/L1/L2 breach, "who's driving latency"                                                                  | `stack:a11y-metrics` |
| a Zenduty alert fired, "is this a deploy regression"                                                                                   | `stack:debug-alert`  |

All SQL lives in `references/queries.sql`; the output skeleton in `references/output-card.md`;
the BQ column map in `stack:a11y-metrics/references/schema.md` (read it before writing any query —
it owns the `$.arr` wrapper, lane↔`kind` aliases, error buckets, and internal group IDs).

## Step 1 — Parse arguments

- Non-flag tokens = scopeKeys (≤5 per run; more → ask the user to batch).
- `--report-id <id>` → report_id ≡ scopeKey → Step 2. (The `RESOLVE --report-id` query is only for the uuid↔report_id↔proxy_map_path mapping, or when direct `a11y_engine_jobs` SQL would full-scan the Rails DB.)
- `--run-id <uuid>` → `RESOLVE --run-id` query → scopeKey → Step 2.
- `--user` / `--group` (combinable) / `--url <host-or-substring>` with no scopeKeys → discovery (Step 1b).
- `--error <bucket-or-message-substring>` → error spread (Step 1b).
- `--days N` → partition window (**default 7** — escalations arrive days late, so 3 mostly misses). `--post <url>` → Slack thread (`…/archives/<CID>/p<digits>` → channel_id + message_ts).
- No scopeKey AND no pivot → print the `argument-hint` usage line and STOP.

## Step 1b — Pivot modes (queries in `references/queries.sql`)

- **Discovery** — `DISCOVERY` query returns a scan **inventory** grouped by scopeKey (not an autopsy card). Route: exactly one problematic scopeKey (`failures>0` or `error_rows>0`) → autopsy it directly; 2–5 problematic → print the table, autopsy each; >5 or none problematic → print the table with a one-line read ("all N completed clean") and let the user pick. Always state the LIMIT cap.
- **Error spread** — `ERROR SPREAD` query measures prevalence across scans. One group / few scans on one host ⇒ isolated (note it, done); many groups with `first_seen` clustered after a deploy ⇒ systemic, **hand off to `stack:debug-alert`**. Exclude internal group IDs (schema.md) when judging customer impact.
- CG follow-up for discovery is per-scan only (swap the Step 4 `query_string` to the userId via `log.custom.f0`) — never pull CG logs for a whole group or error signature.

## Step 2 — Lane timeline from EDS (BigQuery)

Run the `TIMELINE` query — **one job** carrying timeline + error detail + asset-capture rows
(each BQ job is ~10–20s; do not split). Invocation command is at the top of `queries.sql`.

- **Zero rows → auto-widen ONCE** to `INTERVAL 14 DAY` (matches CG retention) before concluding "no data". Still zero → that _is_ the verdict (Step 3).
- **Error detail** comes from `errors_raw` on `has_errors` rows — no second query.
- Watch for `ASSET_CAPTURE` with `status = SUCCESS` but a populated error bucket (failure buried in `runtime_errors`).
- If a JSON path errors, re-check schema.md and show the user the failing SQL + your fix — don't guess silently.

## Step 3 — Gate inference and verdict

Expected lanes for an advanced scan: `SCAN_RUN` (A), `ADVANCE_SCAN_RUN` (B1),
`ADVANCE_SCAN_RUN_WORKER` (B2), `ADVANCE_SCAN_RUN_DOMFORGE` (C), and — only if AI was enabled —
`ADVANCE_SCAN_RUN_AI` / `POSTPROCESS_AI_HTML_WORKER`. Map each to the EOF gate it drains
(`redis-utils.js` getEOFStatus ~L1069):

| Lane            | EOF gate                                         |
| --------------- | ------------------------------------------------ |
| B1              | `<scopeKey>@typeB1` (drains to empty)            |
| B2              | emits final `eof` batch to WebA11y               |
| C               | `<scopeKey>@typeC` (drains to single 'null')     |
| AI              | `eof_ai@<scopeKey>`, `eof@run@ai@<scopeKey>`     |
| AI HTML         | `aihtml_eof@<scopeKey>`                          |
| Custom elements | `eof_ai@ce@<scopeKey>`, `eof@run@ce@<scopeKey>`  |
| Asset capture   | gates C indirectly (no proxy map → no Percy run) |

Core inference: a lane **absent** with its upstream present → that lane's gate is the stall.
Then map signals to named causes, ranked High/Med/Low. Check
`.claude/knowledge/docs/errors/ERROR-CATALOG.md` and `.claude/knowledge/domain/learnings.md`
for a documented match and cite the section.

| Signal                                                              | Inference / named cause                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASSET_CAPTURE` FAILURE — 413 / `zipSize=`                          | Oversized asset zip; 413 not retried (a11y-engine-core devtools/helper.js). Proxy map never built ⇒ missing snapshots AND missing Type C at once.               |
| `script timeout` during asset capture                               | Asset capture exceeded injected-script budget; proxy map skipped (same downstream as above)                                                                     |
| B2 FAILURE then silence                                             | sendFailedResponse (`worker/workerB2.js`) skips `markTaskCompleted` → EOF stall                                                                                 |
| `PERCY_RENDERER_ERROR` `"Timeout: execution expired"`               | Percy render timeout (heavy page / gradients)                                                                                                                   |
| B1 `"Cannot read properties of null (reading 'outerHTML')"`         | AXE-3491 family null-node bug                                                                                                                                   |
| `instrumentation_errors` `websocket error` + B1 lane absent         | socket.io ingress dropped; B1 silently lost (no DOM chunks) while HTTP `/build-proxy-map` completes A/C/B2 and the scan finalises — partial report, not a stall |
| AI lanes done, no EOF at WebA11y                                    | `consolidation_source@<scopeKey>` orphan — cleanup only runs for altText (`helpers/preprocessAndIntegrateAiImageApi.js`)                                        |
| `PREPROCESS_AND_SEND_AI_REQUEST_CONTROLLER` seen but AI lane silent | Lost AI webhook                                                                                                                                                 |
| All lanes SUCCESS but WebA11y reports no `eof=true`                 | Batching desync or send failure → CG logs (Step 4)                                                                                                              |
| No rows even after 14-day auto-widen                                | Wrong scopeKey / scan never reached ip-protection / older than retention                                                                                        |

## Step 4 — CG (Chitragupta) logs: query directly, fall back to signatures

EDS shows _what_ reported; CG logs show _why_. Field conventions (`ip-protection/utils/logger.js`
customLogFormatter): `log.kind` = event kind, `log.custom.f0` = userId, `log.custom.f1` = scopeKey
— sometimes bare (number OR string), sometimes `<scopeKey>@<runId>`. **Match on the scopeKey
alone; never rely on the `@runId` suffix.**

**Preferred — direct query via `mcp__elasticsearch__search`** (if the `elasticsearch` MCP is connected):

1. **Index pattern — cross-cluster, both halves required:**
   ```
   chitragupta-a11y-engine*-serverv*,chitragupta_*:chitragupta-a11y-engine*-serverv*
   ```
   The `chitragupta_*:` half is remote-cluster (CCS) syntax — CG migrates indices to remote clusters within ~a day, so a local-only wildcard returns 0 hits for older windows _even though the data exists_ (verified 2026-06-10: local-only 0 vs CCS 57). **A 0-hit here is NOT a retention gap — never flag infra from a local-only search.** No dedicated worker index — worker lines land in `server` too.
2. **Never list indices or pick a single dated index by name** — rollover dates in index names don't match log timestamps. Always search the full pattern with an `@timestamp` range bound to scan start/end **± 1 hour** (Step 2 gave you the time).
3. **One search:** `size: 100`, sort `@timestamp` asc, bool with `query_string: "<scopeKey>"` + range filter; `_source` = `@timestamp, log.kind, log.message, log.custom.f0, log.custom.f1, log.level`. Scan `log.level` client-side for warn/error — no separate `must_not level:info` query. `track_total_hits: true` for counts.
   - `log.kind` is **text** — use `match`, never `term` (term → 0 hits).
   - `log.custom.f1` is **mixed-type across docs** — never `term`/`wildcard`/`prefix`; `query_string` on the bare scopeKey matches both shapes.
4. **Zero hits → fixed ladder, max 4 ES calls total for the step; never drop the time filter; never improvise query forms:**
   a. Coverage probe: same pattern + range, `match_all`, `size: 1`. Docs returned → coverage fine; retry ONCE with `match` on `log.custom.f1: <scopeKey>`, then stop and report.
   b. Probe also empty → window not covered by the engine pattern; run the scopeKey query ONCE on the broad pattern `*chitragupta*a11y*,chitragupta_*:*chitragupta*a11y*`. WebA11y consumer-side kinds (`BUILD-PROCESSING`, `GROUPED-FINALIZE`, `A11Y-SCORE`, `deduplicate_report`) still answer finalized-vs-stuck; note engine-side detail was unavailable.
   c. Still nothing → write "no CG logs found in window", hand over the UI signatures, move on.
5. Pull the lines around the blocked gate from Step 3 (`WORKER_TYPE_C_SCAN_TIMEOUT`, `WORKER_TYPE_C_NULL_RUNID`, markTaskCompleted "not expected"/"already completed" warnings) and quote them verbatim.

MCP env/binary setup: see memory `es-mcp-setup` and Confluence "Live MCP Onboarding — ElasticSearch (Custom MCP Server)".

**Fallback — MCP not connected** — give paste-ready CG-UI signatures, tailored to the blocked gate (grep the relevant worker for its `kind:` values, e.g. `grep -n "kind: '" ip-protection/worker/workerB2.js`):

```
log.custom.f1: <scopeKey>*              ← everything for this scan (f1 may lack the @runId suffix)
log.kind: WORKER_TYPE_C_SCAN_TIMEOUT    ← Type C skipped because scan already timed out
log.kind: WORKER_TYPE_C_NULL_RUNID      ← dummy-response path taken
```

## Step 5 — Output (and optional post)

Compose the card from `references/output-card.md` (skeleton + formatting + `--post` handling). Default: print to terminal.

## Hard rules

- Read-only everywhere: `bq query` SELECTs only — never DML/DDL or `bq` write subcommands. No Redis, no Jenkins, no Jira, no file edits.
- The single optional `slack_send_message` (only with `--post`) is the only write.
- Always bound `_PARTITIONTIME` — never full-table-scan the partitioned table.
- Quote error messages verbatim; never invent a cause without a cited signal.
