# Known Error Signatures

Check this BEFORE root-causing. If an error shape matches, cite the signature and follow its next-step.

Extend: confirm pattern across ≥2 separate days; never add from one-off observation. Resolved signatures get `**resolved YYYY-MM-DD**` marker, not deletion.

---

## Incident shapes

### S1 — Headings AI 400/403 twin burst = upstream AI provider outage

- **Shape**: ~equal counts of 400 + 403 in `POSTPROCESS_AI_HTML_WORKER` server_errors. CS+AUT, near-zero WA. Scale: 5k–10k each.
- **Diagnosis**: AI provider validation + auth failure. Not an engine bug.
- **Next step**: Check AI provider status / API-key rotation for the window BEFORE touching repo code.
- First seen: 2026-04-14 (16k events, groups 4164730+7066693 dominated).
- Note (2026-04-13): 400-only without 403 twin is a _different_, smaller pattern — if it recurs, split into S1a.

### S2 — "Runtime Error while collecting data for type B" — partial signature-drop (`.error` survives)

- **Shape**: 400–1500/day B1 runtime_errors. Generic `.message` ("Runtime Error while collecting data for type B") but `.error` field IS populated 99%+ of the time.
- **Diagnosis**: `addNonCheckError(type, msg, err)` called with 3 args at `a11y-engine-core/lib/core/public/typeB1Runner.js:282`, vs handler signature `(type, err)` in `ip-protection/utils/errors/error-handler.js:39-57`. Only `stack.description` / `stack.code` are dropped — `.error` (set separately via `err.toString()` upstream) survives. Confirmed 478/479 events on 2026-04-23.
- **Next step**: ALWAYS run the Phase 4c inner-error drill-down on this bucket — don't assume it's opaque. Common inner errors observed: `Data collection took too long` (~92% of bucket), `outerHTML null` DOM race, iframe `querySelectorAll null`, `oklab()` color-parse failures, DOM > 64MiB.
- **Tracking**: AXE-3315 (Optimize Data collection took too long Error) is the canonical fix ticket for the dominant inner error.
- **Updated 2026-04-23**: original "real error discarded at emit" diagnosis was stale; `.error` is queryable.

### S3 — "Inspector protocol error: %s" = unformatted CDP template leak

- **Shape**: `ASSET_CAPTURE` runtime_errors with literal `%s`. Volume 1k–5k/day.
- **Diagnosis**: Chrome DevTools `exceptionInfo` rejected raw at `a11y-engine-core/devtools/resourceCaptureHelper.js:47-60`. `.message` is undefined so unformatted template leaks. Real failure in `exceptionInfo.value`/`.details`.
- **Next step**: Wrap `exceptionInfo` into real `Error(value || details?.text || JSON.stringify(ei))`. No BQ query will reveal the cause — it's discarded at source.

### S4 — "Scan timed out before processing pending runs for scanId: [ID]" single-product

- **Shape**: `server_errors` in ONE product (AUT or WA). Few distinct scanIds repeat (136–5,208 events).
- **Diagnosis**: Per-scan 60-min wall-clock cap at `ip-protection/helpers/timeoutCleanup.js:45` via `utils/redis-utils.js:2376`. Fans out to every pending runId in that scan.
- **Next step**: Identify the scanId(s); examine that scan's product + group_id. Fix is product-side (longer budget) or customer-side.

### S5 — WA-only Type A "Runtime Error while running A11y Engine" wrapper

- **Shape**: Type A runtime_errors, message `Runtime Error while running A11y Engine`, 95%+ in WA.
- **Diagnosis**: Wrapper at `a11y-engine-core/lib/core/public/run.js:140, 277`. Real stack preserved in `errors.arr[].runtime_error[].error` (stack field), but BQ `message` shows only the wrapper.
- **Next step**: Query `errors.runtime_error[].error` (stack field) filtered to `product.name='WORKFLOW_ANALYSER'`, bucket by stack prefix.

### S6 — "Cannot read properties of null (reading 'html')" Type AI = Redis eviction race

- **Shape**: AI server_errors, CS-concentrated (~70%+).
- **Diagnosis**: `imageData` null at `ip-protection/worker/workerAI.js:104` (and `jobAIColorContrast.js:122`, `workerCustomElementsAI.js:98`). Redis key evicted (TTL) or race between `sendAIImageData` and `processAITypeCJob`.
- **Next step**: Check Redis memory pressure. Fix: null-guard + distinguish eviction vs. corruption.

### S7 — "Element Undefined in custom element null" (CS+AUT, near-zero WA)

- **Shape**: B1/A debug_errors ending `custom element null`. 500–1500/day. CS+AUT contribute; WA near-zero.
- **Diagnosis**: Stale selector at `a11y-engine-core/lib/commons/custom-element-handlers.js:938-942`. Stored selector no longer resolves — SPA route, vDOM re-render, iframe reload between devtools pass and content-script pass. Literal "null" = tagName was null when coerced.
- **Next step**: Debug-level noise; rarely causes FAILURE. Don't prioritize unless scan actually failed. Fix: log selector + dedup traversal.

---

## Attribution shapes

### A1 — Two-group concentration (>70% from ≤3 groups) = customer-specific

- **Shape**: Phase 5a top 2–3 rows sum to 70%+ of day's failures.
- **Diagnosis**: One or two big customers, not an engine regression.
- **Next step**: Customer/CSM outreach before code changes. Don't ship a fix on this signal alone.
- **Threshold**: top-3 < 40% → treat as systemic.

### A2 — CS OnDemand clean, CS Background burning = blast-radius imbalance

- **Shape**: CS OnDemand L1 ≥98% while CS Background critical in same scan type. Volume gap: OnDemand 100–1000/day vs Background 30k–60k/day.
- **Diagnosis**: Small OnDemand fleet escaped the hot path. SLA is intact.
- **Next step**: Report as "incident hit Background only; OnDemand SLA intact". Not an SLA breach.

### A3 — Same group_id in top-10 for ≥5 of last 7 days = known-loud customer

- **Shape**: Group_id recurs in Phase 5a top-10 across multiple consecutive days.
- **Diagnosis**: Chronic customer issue — their pages/tests/traffic consistently break things. Not a day-of regression.
- **Next step**: Add to "known loud" project memory with pattern (which scan type, why). Don't re-root-cause next time.
- **Current known-loud**: (populate when confirmed across ≥5 of 7 days with >50% concentration in one track × scan type).

---

## check_errors

### C1 — check_errors are chronic, not acute

- **Shape**: Total < 5% of named-bucket volume. Same check (usually `color-contrast`) dominates day after day.
- **Diagnosis**: Per-rule evaluation bugs accumulating over time; most scans still complete SUCCESS/PARTIAL.
- **Next step**: Route to sprint planning. Don't lead L0 triage with them.
- **Exception** (added 2026-04-17): A single check >3× its 7-day mean AND >1,000/day IS acute — flag it. Example: `color-contrast` Type A spiked 1,112 → 9,214 on 2026-04-17.

---

## How to add a new signature

1. Confirm across ≥2 separate days.
2. Write: **Shape**, **Diagnosis**, **Next step**. Cite first-seen date.
3. Include file:line for any code reference.
4. Mark `**resolved YYYY-MM-DD**` rather than delete when fixed.
