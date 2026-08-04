---
name: stack:debug-fp
description: Investigate accessibility false positives on a live page. Locate the rule algorithm across a11y-engine-core / axe-core / ip-protection / dom-forge-core, port it to the browser, decide FP vs TP. Triggers&colon; "false positive", "why is this flagged", "debug rule on URL".
argument-hint: '<rule-id> <url> [css-selector, …]   # one or more selectors for the flagged element(s)'
---

# debug-fp &mdash; Live-page false-positive investigator

Given `<rule-id> <url> [selectors]`, drive Chrome, run the rule against the flagged element(s), decide FP vs TP.

## Precondition

Requires a `claude --chrome` session with the Claude-in-Chrome extension connected. If browser-action tools are absent, stop and tell the user. Path B (proxyMap fallback) works without the extension via `scripts/run-with-axe.js`.

## Workflow

### 1. Intake

Required: `rule-id`, `url`. Preferred: one or more CSS selectors (or XPaths).

Selectors are always a list. A scan often reports the same offender via multiple CSS paths; accept them all, run every selector in one port, and **de-duplicate by DOM node identity** in analysis. Collapse duplicates to one verdict entry. Different elements &rarr; judge each independently.

**AI vs non-AI mode.** If the rule has both routes (see `references/rule-locator.md` for the catalogue and `aiRulesId` canonical list), ask which mode produced the violation before porting. Algorithms, tags, and docs overlap; only the worker dispatched at runtime determines behaviour.

### 2. Locate the rule + fetch the public docs

Follow `references/rule-locator.md`. It covers: rule JSON location, the worker-based type taxonomy (A/B1/B2/C/AI), the AI worker family, the `dummySelector` trap, and the report-back template. For the authoritative taxonomy + dispatch-fn table, see [`.claude/knowledge/docs/flows/rule-types.md`](../../knowledge/docs/flows/rule-types.md). Fetch the public docs at:

```
https://www.browserstack.com/docs/accessibility/rules/a11y-engine/<major.minor>/<rule-id>
```

`<major.minor>` comes from `a11y-engine-core/package.json` (e.g. `6.3.1` &rarr; `6.3`). If the page body is _"Content in development"_ or empty, stop &mdash; do not retry. Reconstruct intent from the rule's `.json` tags (WCAG SCs, ACT IDs), the wired check JSONs, and the cited WCAG SC itself. State: _"Docs page is a placeholder; inferring intent from `<tag-list>` and `<evaluator-files>`."_

Emit the report-back block from `rule-locator.md` §"Output of this phase", including the exact worker filename.

### 3. Paper-triage &mdash; can a live drive be skipped?

With the rule algorithm, the docs/tags, and the user's `outerHTML`, often you can decide statically:

- Algorithm has an early-return branch the element clearly matches &rarr; predict verdict.
- WCAG SC demonstrably does not apply (e.g. 4.1.2 cited, element is not a UI component) &rarr; FP by design, no drive needed.
- Decision hinges on computed style / layout / shadow DOM / hydration / virtual tree &rarr; drive.

State the hypothesis in one sentence and ask whether to verify live. If verifying, continue. Otherwise skip to step 8.

### 4. Drive the browser

**Path A (default)** &mdash; live URL via Claude-in-Chrome. Navigate; confirm URL/title from the browser.

**Path B (fallback)** &mdash; proxyMap replay via `mini-percy-renderer` when the live URL is unusable (auth / geo / removed / drift). Darwin-arm64 only. Full recipe: `references/proxy-map-fallback.md`.

Never silently fall from A to B. Confirm which `proxy_map.json`.

### 5. Manual steps (Path A only)

If the flagged element needs login / banner dismissal / dropdown open, ask the user to do it and say "ready". Prefer user action over scripted clicks.

Path B cannot do manual interactions reliably &mdash; the snapshot should already capture the DOM in the reported state. If it doesn't, escalate to a fresh scan.

### 6. Inject axe + write the port

**Inject.** Path A: read `a11y-engine-core/dist/axe.min.js` and evaluate via the integration, then `axe.setup(document)`. Path B: `scripts/run-with-axe.js` does this automatically. Required for Type B1/B2/C/AI because client data collection at scan time runs through axe. Full recipe in `references/axe-injection.md`.

**Port.** Copy `templates/port-skeleton.js` to `/tmp/debug-fp-<rule-id>.js` and fill in. Rules (both paths):

- `TARGET_SELECTORS` array at top; iterate, dedupe matched nodes by identity, one entry per unique element
- IIFE returning `{ decision, reasons, observed }` &mdash; never a DOM node
- No `import` / `export`; no `console.log` in the happy path
- `axe.teardown()` in `finally` when axe was injected (Path A of script-conversion.md)

Path A of script-conversion uses `axe.commons.*` / `axe.utils.getNodeFromTree` for Type A rules, or rebuilds `nodeData` from `axe.utils.getFlattenedTree()` and inlines ip-protection helpers verbatim for Type B1/B2/C/AI. Path B (native DOM) is the fallback when injection is blocked &mdash; document in the verdict.

Show the user the filled-in script before running.

### 7. Execute the port

**Path A:** evaluate the port IIFE via the integration. Fallback: console-relay with `console.info('[debug-fp]', JSON.stringify(__result))` + read-console.

**Path B:** `node scripts/run-with-axe.js /tmp/debug-fp-<rule-id>.js [--match=<url-substring>]`. Prints JSON on stdout.

**Neither available:** ask the user to paste the port into DevTools Console and return the JSON.

### 8. Analyse

Apply `references/fp-analysis.md`. Render **two independent judgments**:

- **WCAG axis** &mdash; does the cited SC actually apply to this element?
- **Algo axis** &mdash; does the algorithm correctly implement the SC for this case?

Classify: **TP**, **FP by design** (WCAG does not apply, algo fires), **FP by bug** (WCAG applies but algo fires wrong), or **INCONCLUSIVE**. Don't hedge.

### 8.5. Offer to reuse the session

Chrome + jackproxy are still up, axe is already injected. Before any teardown, ask:

> "`<url>` is still live with axe injected. Run another selector, try another rule on this page, or tear down?"

Another selector/rule: edit `/tmp/debug-fp-<rule-id>.js` and re-run via `run-with-axe.js`. The runner detects existing axe (`{injected: false, reason: 'already present'}`) and skips re-injection &mdash; near-instant.

### 9. Summarise

```
Rule&colon;       <rule-id> (Type <A|B1|B2|C|AI> via <workerName>)
URL&colon;        <url>
Selectors&colon;  <sel-1>, <sel-2>, …   (note any that collapsed to the same element)
Element(s)&colon; one block per unique element:
  - <outerHTML truncated>
    Verdict&colon;    <TP | FP-by-design | FP-by-bug | INCONCLUSIVE>
      WCAG axis&colon;  <SC applies | SC does not apply> — <one sentence>
      Algo axis&colon;  <fires correctly | fires wrong branch | misses>
    Reason&colon;     <one-sentence root cause>
    Evidence&colon;   <3–5 key fields from observed>
Trace&colon;      <numbered grep / read / fetch / inject / evaluate steps>
Artifacts&colon;  /tmp/debug-fp-<rule-id>.js, /tmp/debug-fp-<rule-id>-raw.json
Fix hint&colon;   <file:line — specific branch to revisit, if FP; page-side fix if TP>
```

If FP, name the exact `file:line` of the branch. If inconclusive, list the next probe.

## Operating notes

- One tab per investigation. State what you're about to click/type before acting &mdash; browser actions are user-visible.
- The user's browser session carries real cookies/credentials. Do not persist scan data beyond `/tmp/debug-fp-<rule-id>.js` and the report.
- Scope: debug, not rewrite. Rule-source fixes go through `add-rule` or a regular dev flow.
- Type AI with LLM judgement (`workerAI`): port the client pre-filter only; document "needs server re-run" and stop.
- Shadow DOM / cross-origin iframes: note the limit; cross-origin iframes are usually unreachable.
- Background `kill` on jackproxy / launch-proxy-chrome exits with code 143 (SIGTERM) &mdash; that's normal shutdown, not failure.
