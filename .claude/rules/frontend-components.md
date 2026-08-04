---
paths:
  - 'a11y-engine-core/**'
  - 'dom-forge-core/**'
---

# Browser-Context Rules

Applies to both `a11y-engine-core` (extension / Website Scanner / A11y Automate SDK) and `dom-forge-core` (Percy runtime). These packages run on pages with **10k+ DOM nodes**. Performance is non-negotiable.

## Performance

- **No full-tree DOM walks.** If you need ancestors, walk up from the candidate node — don't `document.querySelectorAll('*')`.
- **No nested DOM loops.** A loop inside a loop, both iterating DOM, is forbidden.
- **No repeated `querySelectorAll`.** Cache the result once and reuse. Same for `getComputedStyle` on the same node.
- **No allocations in hot loops.** Reuse buffers, avoid `Array.from` / spread for already-iterable collections inside per-element loops.
- **Avoid layout-thrashing APIs** (`getBoundingClientRect`, `offsetWidth`, etc.) unless required. Batch reads before any write.

## DOM safety

- Never assume DOM shape — every reach for a child node or attribute must handle null/missing.
- Use `ErrorHandler` from `a11y-engine-core/lib/core/errors/error-handler.js`. All failure paths must be explicit.
- **Always wrap `document.querySelector(selector)` / `element.querySelector(selector)` in `try/catch`** when `selector` comes from rule JSON, AI candidates, user config, or any non-literal source. Invalid CSS selectors throw `DOMException` and crash the content script for the rest of the scan (PR #2020).
- **Use optional chaining for nested payload/config access.** `payload?.elementData?.id`, `configuration?.axeCoreConfig?.runOnly` — these fields can be undefined depending on caller / scan mode. Direct access has crashed AT handlers multiple times (PR #2048, #2071).

## Feature flag truthiness

`a11yCoreConfig` flags arrive from WebA11y BE via socket, Redis (which returns `0`/`1` strings or numbers), and inline config. JS truthiness is **not safe** for these values.

- **Always compare with `=== true` or use `isStrictlyTrue(value)`** when gating on a flag (PR #2098, #2071, #2024).
- The string `'false'` is truthy in JS — a flag stored as a Redis hash field will round-trip as a string, so `if (flag)` silently turns OFF flags ON.
- For Redis-sourced booleans, normalize at read time: `const enabled = String(value) === 'true' || value === 1;` — do not propagate the raw value into rule logic.

## Per-tab state for ATs

Auto-Test (AT) sessions can run concurrently in multiple tabs. A single mutable module-level object (`atSessionData`, latency counters, scan state) gets clobbered when a second tab starts a session before the first finishes (PR #1971).

- Key session state by `tabId` (or `sessionId`) — keep a `Map<tabId, SessionState>`, never a singleton.
- `apiTime.start` / `apiTime.end` markers must live per-session. Cross-tab corruption shows up as `NaN` latencies in EDS.

## Rule message accuracy

When authoring or modifying rule check/fail/pass messages:

- **The message must describe the WCAG criterion the rule actually tests.** Mixing 2.1.1 (keyboard focusability) with 2.4.7 (focus indicator visible) wording has shipped in production (PR #2089).
- **Pass messages describe the accessible condition, not a sanitized violation.** A pass message that reads like a violation confuses reporting (PR #2089).
- **Text normalization must be consistent across all code paths in a rule.** If the matcher trims/collapses whitespace, the check must do the same; mismatches produce inconsistent pass/fail (PR #1982).
- **Focus-indicator detection must check ALL relevant CSS properties** — `outlineStyle`, `outlineWidth`, `outlineOffset`, `outlineColor`, and the `:focus-visible`/`:focus` pseudo states. Checking only `outlineOffset` and `outlineWidth` misses transitions like `outline-style: none → solid` (PR #2048).

## AT view layering

`a11y-engine-core/lib/at-*` modules have a base AT class and per-view subclasses (Forms, Responsiveness, etc.). Behavior that varies by view stays in the view subclass, not the base class.

- **View-specific timeout, retry, or state-transition logic must live in the view.** Putting Forms-AT-specific timeout in the shared base broke other ATs (PR #2020).
- **Common helpers go in `lib/commons/`, not into the AT class hierarchy.** If two ATs need the same helper, extract — do not duplicate it into both view classes (also see `lib/core/utils/full-path-selector.js` — duplicated once, PR #2014).

## Logging

- **No `console.log` anywhere.** ESLint `no-console` is a warning, but treat it as an error in review.
- Use `EDSUtils.createEDSEvent(config)` from `a11y-engine-core/lib/core/utils/eds-utils.js`.
- Log **failures and unexpected cases only**. Browser logs are sampled and expensive. Never log success paths or per-element processing.

## Rule and runner locations

### `a11y-engine-core` (Type A and B1 client-side parts)

- **Check JSON** — `lib/checks/<category>/<rule-name>.json`
- **Check evaluator** — `lib/checks/<category>/<rule-name>-evaluate.js`
- **Rule JSON** — `lib/rules/<category>/<rule-name>.json`
- **Commons** — `lib/commons/`
- **Type classification arrays** — `lib/core/base/constants.js`: `TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`. **The arrays drive dispatch — JSON location alone does not.**

### `dom-forge-core` (Type C runtime on Percy)

- **Runners** — `lib/core/runners/*.js`: `color-contrast.js`, `focus-visible.js`, `non-text-control-contrast.js`, `reflow-4x-zoom-scroll.js`, `resize-2x-zoom.js`, `text-in-images.js`, `custom-elements-snapshot-capture.js`, `meaningfulAltText/`.
- **Evaluators** — `lib/checks/*-evaluate.js`.
- **Percy binding** — `percy/binding.js` exposes interactions.

## `dummySelector` trap

Type C rule JSON often has `"selector": "dummySelector"`. The real selector is computed inside the runner. Don't try to evaluate the JSON's `selector` field literally for Type C rules.

## No Deque code

The submodule is a **BrowserStack fork** of axe-core 4.11.0. Use BrowserStack's forked APIs only — do **not** pull packages from Deque or assume upstream axe behavior matches.

## Build

```bash
cd a11y-engine-core
./build/scripts/build_axe.sh           # builds axe-core submodule first
npm install && npm run build           # Grunt → dist/a11y-engine-core.min.js
npm test                               # Karma + Mocha + Chai

cd dom-forge-core
npm run build                          # Grunt
npm test                               # Mocha (test/checks/*.js, test/*Spec.js)
```
