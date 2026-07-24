# Rule locator

Given a `rule-id`, find the definition + `evaluate()` body across all four packages. Start broad, then narrow.

## Quick grep

```bash
# Rule JSON definition (the selector, tags, impact, check references)
grep -rln "\"id\"[[:space:]]*:[[:space:]]*\"<rule-id>\"" \
  a11y-engine-core/lib/rules \
  a11y-engine-core/lib/checks \
  ip-protection/rules \
  ip-protection/checks \
  axe-core/lib/rules \
  axe-core/lib/checks \
  dom-forge-core/lib 2>/dev/null
```

Then for each hit, open:
- the rule JSON (gives `selector`, `all` / `any` / `none` check ids, `tags`, `impact`)
- each referenced check JSON (gives `evaluate` file name)
- the `*-evaluate.js` (the algorithm you will port)

## Rule-type taxonomy (authoritative)

Type is determined by **which worker dispatches the rule**, not by where the rule JSON lives. Some rules have multiple routes gated by a runtime flag (e.g. `accessible-name` runs through `workerB1` in deterministic mode, `workerAI` when the AI flag is on) &mdash; always ask the user which mode is active before porting.

| Type | Rule JSON lives in | Judgement runs in (worker) | Notes |
|---|---|---|---|
| **A** | `axe-core/lib/rules/` (fork) and `a11y-engine-core/lib/rules/` | browser (client-side, via a11y-engine-core's axe) | Pure client, no server round-trip. |
| **B1** | `ip-protection/rules/` + `ip-protection/checks/` | `ip-protection/worker/workerB1.js` &rarr; `combinedRulesRunner` &rarr; `combined-rules-class-v*.js` | Server-side deterministic, operates on the `nodeData` snapshot. Most of the combined-rules chain (accessible-name, role-required, keyboard-*, menu-*, etc.) lives here. |
| **B2** | `ip-protection/rules/` + `ip-protection/checks/b2Rules.js` | `ip-protection/worker/workerB2.js` | Uses `reconstructDOM`, batched, post-processed. |
| **C** | logically dom-forge-core territory; dispatched via ip-protection | `ip-protection/worker/workerC.js` | Handles custom-element / DOM-snapshot / screenshot-coupled paths (`getAndDeleteCustomElementsMetadata`, `proxyUrl`, `percyStartTime`). |
| **AI** | `ip-protection/checks/aiRules.js` / `aiChecks.js` (+ `ip-protection/checks/<rule>-ai/`) | **family** of workers in `ip-protection/worker/` &mdash; see below | LLM calls (Gemini), image pipelines, OCR. A rule may have both a B1/B2/C deterministic route and an AI route gated by a flag. |

### The AI worker family

"Type AI" is not one worker &mdash; it's a dispatch family. Different AI-rule categories go through different workers:

| Worker | Rules it handles | Notes |
|---|---|---|
| `workerAI.js` | generic AI rules (anything routed via `aiRules.js` not caught by a specific worker below) | Imports `aiRules` + `aiChecks`; baseline path. |
| `jobAIColorContrast.js` | `color-contrast` in AI mode | Dedicated job; runs the color-contrast LLM heuristic against image samples. |
| `workerCustomElementsAI.js` | custom-element AI rules (classifying custom tags, `role-required` / `accessible-name` / `keyboard-interactive` on unknown elements) | Uses `fetchAndDeleteCustomElementData` and `aiRulesId` constants. |
| `workerPreProcessAIhtml.js` &rarr; `workerPostProcessAIhtml.js` | heading-family AI rules: `missing-heading-ai`, `invalid-heading-ai`, `incorrect-heading-ai` (and anything using the AI-HTML pipeline) | Pre-worker reduces the DOM + ships to the AI API; post-worker consumes the AI response, calls `reconstructDOM`, re-runs `aiRules`. |
| `workerImage.js` | OCR-backed rules (`text-in-images`, image-description feeds) | Schedules OCR via `OCRScheduler`, may be upstream of the above workers. |

The canonical list of AI-routed rule IDs lives in `ip-protection/utils/constants.js` as `aiRulesId`. As of this writing:

```
meaningful-alt-text-ai, decorative-image, missing-long-alt, color-contrast (AI mode),
image-alt-ai, invalid-heading-ai, incorrect-heading-ai, missing-heading-ai,
role-required, accessible-name, keyboard-interactive
```

Note: `role-required`, `accessible-name`, and `keyboard-interactive` appear in `aiRulesId` **because they have AI-mode variants** &mdash; their non-AI deterministic path still runs through `workerB1.js`. Ask the user which mode was active (see SKILL.md §1).

### How to identify which specific worker handles a rule

1. Grep `aiRulesId` in `ip-protection/utils/constants.js` for your `<rule-id>`. If present, it has an AI mode.
2. Grep the four AI workers + `jobAIColorContrast.js` for the rule id or its check id (from `aiCheckId` in the same constants file). The file that matches is the dispatcher.
3. If none match but the rule id is in `aiRulesId`, the generic `workerAI.js` is the fallback.
4. For non-AI mode (or rules absent from `aiRulesId`), the worker is `workerB1`, `workerB2`, or `workerC` &mdash; match by rule JSON location and the imports in `combined-rules-class-v*.js` / `b2Rules.js` / `workerC.js`.

**If the user does not specify AI vs non-AI mode and the rule has both routes, ask.** The algorithms, tags, and docs can overlap; the worker dispatched at runtime is the only thing that determines behaviour.

## `dummySelector` &mdash; selection is per-node iteration, not CSS

Many Type B1/B2/C rules in `ip-protection/rules/*.json` have `"selector": "dummySelector"` and a no-op matcher (`function roleRequiredAccessibleNameMatcher() {}`). This is a trap: **there is no CSS selector that filters which elements the rule runs on.** Instead, selection happens per-element inside the worker dispatch:

```js
// ip-protection/worker/combined-rules-class.js::evaluate
if (nodeDetails[SHORTENED_KEY.isVisibleToScreenReaders] === 1) {
  this.errorBoundary('role_required', () =>
    roleRequiredAccessibleNameCheck.call(this, nodeData, nodeDetails, selector)
  );
}
```

The `evaluate` method is invoked **once per node** by the worker, for every node the capture pipeline included. The rule's JSON-level `selector` is not consulted; any gating comes from inside the evaluate function (`isCustomElement(selector)`, role checks, `isVisibleToScreenReaders`, etc.).

### Implications for FP fixes

When the verdict's fix hint says "tighten the client-side selector", check the rule JSON first:

- If `selector` is a real CSS string (e.g. `'a[href]'`, `'[role="button"]'`) &rarr; selector tightening is a valid fix lever.
- If `selector` is `'dummySelector'` (or similar sentinel) and the matcher is a no-op &rarr; **selector tightening is not a real lever**. The fix belongs inside `evaluate` / the rule's helpers: add an early-exit guard (e.g. "skip if implicit role is a non-interactive structural role and no handlers / tabindex are present"), and the guard will apply uniformly across every `combined-rules-class-v*.js` version.

### Telling them apart quickly

```bash
grep -l '"selector"[[:space:]]*:[[:space:]]*"dummySelector"' ip-protection/rules/*.json
```

The per-node iteration also explains why capture-time scan data (which elements were in `nodeData` and what their `SHORTENED_KEY.*` fields looked like) matters more than the rule's nominal selector when reproducing an FP.

## The "which is the judgement path" question

For Type B1/B2/C/AI, a rule often has *both* a client side (selector + DOM capture via a11y-engine-core's axe) and a server side (the actual pass/fail decision). The **judgement** is whatever code returns `true|false|undefined` for the violation. Port that one. If the judgement is LLM-only (a Gemini call on a screenshot), the skill cannot faithfully reproduce it in-browser &mdash; document the limit, port the client pre-filter only, and classify as "needs server re-run".

## axe-core fallback chain (Type A only)

If `<rule-id>` doesn't match anything in a11y-engine-core, check axe-core &mdash; some rules are inherited unchanged from the fork. Per the top-level rules file (`CLAUDE.md`), **never modify axe-core** but you *can* read it to port its algorithm. Terminology note: CLAUDE.md's older taxonomy labels these as "B1 client-side"; this skill uses the worker-based taxonomy above, in which they are **Type A**.

## Commons dependencies

Check-evaluate files commonly reference:

- `a11y-engine-core/lib/commons/**` &mdash; inline the relevant helper into the ported script
- `axe.commons.*` / `axe.utils.*` &mdash; substitute with native DOM equivalents (see `script-conversion.md`)
- `ErrorHandler` from `lib/core/errors/error-handler.js` &mdash; replace with plain `try/catch` that returns `{ decision: undefined, reason: 'check error', error: String(e) }`

## Fetch the public docs for WCAG intent

In parallel with source location, pull the user-facing rule docs. These describe the rule's WCAG intent, pass/fail examples, and known caveats &mdash; essential for deciding whether an algorithm divergence is a legitimate FP or a WCAG-valid TP.

### URL construction

```
https://www.browserstack.com/docs/accessibility/rules/a11y-engine/<major.minor>/<rule-id>
```

- `<rule-id>`: the rule's `id` (e.g. `accessible-name`, `unnecessary-list`).
- `<major.minor>`: read from `a11y-engine-core/package.json` &mdash; take the first two segments of the `version` field (e.g. `6.3.1` &rarr; `6.3`).

Use the WebFetch tool against that URL. If the page 404s, try the previous minor (e.g. `6.2`) &mdash; the docs are cut per major/minor release and some in-flight rules only publish on the next cut.

### What to extract

- **Description / intent** &mdash; the plain-English statement of what the rule checks.
- **Success criterion** &mdash; the WCAG SC(s) cited (e.g. `1.3.1 Info and Relationships`).
- **Pass examples** &mdash; DOM patterns the rule accepts.
- **Fail examples** &mdash; DOM patterns the rule rejects.
- **"Known issues" / "Exclusions"** &mdash; if the page lists patterns the rule knowingly mis-fires on, a match here is an instant FP verdict.

### How to use it in the verdict

The docs give you the "what this rule is supposed to do" axis; the source gives you the "what the algorithm actually does" axis. An FP usually lives in the delta between the two:

| Docs say | Algorithm does | Verdict |
|---|---|---|
| "A pattern is valid when X" | Algorithm does not check for X | **FP &mdash; rule is too narrow.** Fix in source. |
| "A pattern is a violation when X" | Algorithm fires on Y (Y &ne; X) | **FP &mdash; rule is mis-targeting.** Fix in source. |
| "A pattern is valid when X" | Algorithm checks X correctly | Likely **TP** &mdash; the page is doing something the docs call out as failing. |
| Docs list this exact case under "Known issues" | &mdash; | **FP &mdash; documented.** Link the docs section in the verdict. |

## Output of this phase

Before moving to the launch step, emit to the user:

```
Rule:       <rule-id>
Type:       <A | B1 | B2 | C | AI>   (worker-based; ask user if rule has both AI and non-AI routes)
Worker:     <axe (client) | workerB1 | workerB2 | workerC | workerAI>
Selector:   <from rule JSON>
Tags:       <WCAG tags>
Impact:     <critical | serious | moderate | minor>
Algorithm:  <path/to/*-evaluate.js>   (<N> LOC)
Deps:       <commons files, axe-commons calls — each to inline or stub>
Judgement:  <client | server deterministic | server LLM>
Docs:       <docs URL> — <one-line summary of WCAG intent from the page>
```
