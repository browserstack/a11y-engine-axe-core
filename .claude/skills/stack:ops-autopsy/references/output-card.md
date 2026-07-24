# Output card (Step 5)

Copy this skeleton and replace every `<placeholder>`. Do NOT change the structure, section
order, or emoji markers — fill in the blanks only. Keep every lane row; if a lane wasn't
expected (e.g. AI never enabled) write "not enabled / expected absence" rather than dropping it.

```markdown
🧬 **Scan autopsy** — scopeKey `<scopeKey>` · <product> · group `<group_id>` / user `<user_id>` · `<url>`

🕒 **Timeline** — <first event ts> → <last event ts> UTC (<duration>; <n> EDS events + <m> CG log lines), found in the <N>-day window. <One-line context note if relevant: internal group, test pages, window auto-widened, etc.>

| Lane | Seen | Status | Notes |
|---|---|---|---|
| A (`SCAN_RUN`) | ✅/⚠️/— <count> | <status> | <latency / per-page detail> |
| Asset capture | ✅/⚠️ <count> | <status — flag "SUCCESS with buried runtime error" explicitly> | <which page failed, if any> |
| B1 (`ADVANCE_SCAN_RUN`) | ✅/⚠️ <count> | <status> | <latency range> |
| B2 (`ADVANCE_SCAN_RUN_WORKER`) | ✅/⚠️ | <status> | <CG kinds + timestamps: WORKER_TYPE_B2_EXECUTION_COMPLETE, merge pass> |
| C (`ADVANCE_SCAN_RUN_DOMFORGE`) | ✅/⚠️ <n> events, <k> of <total> pages | <status per batch> | <which pages/batches missing or failed> |
| AI dispatch | <PREPROCESS_AND_SEND_AI_REQUEST_CONTROLLER seen? + ts> | — | <webhooks returned? lost-webhook?> |
| AI (`ADVANCE_SCAN_RUN_AI`) | <count or — > | <statuses> | <PARTIAL_SUCCESS noted explicitly> |
| AI HTML / custom elements | <seen or — > | <status> | |

🚧 **Blocked gate (inferred)** — **<gate name / "none — all lanes reported">**. <2–3 sentences of evidence: which CG kinds present/absent (API_SCAN_COMPLETE, REDIS_SCAN_COMPLETE), what the silence after <ts> means, "failed" vs "stuck" distinction.>

❌ **Errors** — <count + which kind/runId>, verbatim:

> "<exact error message from errors_raw — never paraphrase>"

🧭 **Likely cause(s)** (ranked)

1. **<named cause from Step 3 table>** — confidence **High/Med/Low**. <Evidence chain in 2–3 sentences, citing file:line and the verbatim signal. Note related-but-distinct known issues (e.g. AXE-3497) to prevent misattribution.>
2. **<secondary cause / downstream effect>** — confidence **<H/M/L>**. <evidence>

🔎 **CG follow-up** — <what was already queried: index pattern, time range, line count, "all info-level" or quoted warn/error lines>. UI signatures if digging further:
```
log.custom.f1: <scopeKey>*
log.kind: <kinds tailored to the blocked gate>
```

✅ **Next steps for the human**
- <Answer for WebA11y/CS in one line: what the report actually contains / is missing, and whether a re-scan helps.>
- <Engineering follow-up candidates with file:line pointers — this bot changes nothing.>

⟨autopsy:<scopeKey>⟩
🤖 Automated read-only diagnostic by Claude (/stack:ops-autopsy). No changes were made. Verify before acting.
```

## Formatting rules

- ✅ = lane fully accounted for; ⚠️ = present but partial/suspicious; — = absent.
- Quote every error message verbatim in a blockquote — never paraphrase or truncate.
- The **Notes** column is where the story lives — counts, timestamps, affected page/runId go there, not in prose.
- "Failed" ≠ "stuck": a terminal failure badge means FAILURE was delivered (finalised); "stuck" means no terminal status ever reached WebA11y. Say which one explicitly in the Blocked-gate section.
- Default: print to terminal as markdown (tables render).
- `--post`: Slack does not render markdown tables — convert the lane table to a fixed-width code block, keep the rest. Read the thread first (`slack_read_thread`); if any reply already contains `⟨autopsy:<scopeKey>⟩`, print `Already posted for <scopeKey>` and STOP. Otherwise send the card as ONE threaded reply and print the permalink.
