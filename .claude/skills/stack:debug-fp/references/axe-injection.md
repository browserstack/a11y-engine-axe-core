# Injecting the forked axe bundle

The preferred way to port a rule is to inject BrowserStack's forked axe build, call `axe.setup()`, and then use `axe.commons.*` / `axe.utils.*` from inside the port. This mirrors what a11y-engine-core does at scan time, so the port sees the data the engine (and, for Type B1/B2/C/AI, the server worker) sees.

Fall back to native-DOM porting (`script-conversion.md` Path B) only when injection fails.

## Which bundle

**Use `a11y-engine-core/dist/axe.min.js`** &mdash; the published fork bundle, identical to `axe-core/axe.min.js`. Never upstream npm `axe-core` (per `CLAUDE.md`: fork only).

## How it's injected

- **Path B (proxyMap)**: `scripts/run-with-axe.js` injects automatically (reads the bundle, evaluates it via CDP, calls `axe.setup(document)`, runs the port, handles teardown).
- **Path A (Claude-in-Chrome)**: read the bundle via `Read`, pass as the `text` param to one `javascript_tool` call wrapping:
  ```js
  (() => {
    if (window.axe) return { injected: false, reason: 'already present', version: axe.version };
    try { /* pasted bundle */ return { injected: true, version: axe.version }; }
    catch (e) { return { injected: false, error: String(e?.message || e) }; }
  })()
  ```
  Then a separate call: `axe.setup(document)`.
  Bundle is ~600KB &mdash; one-time per investigation.
- **CSP blocks inline scripts**: fall back to Path B of script-conversion.md. Don't attempt CSP bypass.

## Lifecycle

```js
axe.setup(document);  // builds virtualTree
// ... port runs here ...
axe.teardown();        // clears virtualTree
```

- `axe.setup(document)` is idempotent per page load but re-walks; call once.
- `axe.teardown()` must go in `finally` &mdash; leaked virtual trees confuse subsequent scans.
- Same-origin iframes: `axe.setup(frames[i].document)` within that frame's context, or use `axe.utils.getFlattenedTree()` (recurses).
- If the page already has `window.axe`, reuse (do not overwrite) or abort with a note.

## Mapping rule-source calls to in-page APIs

**Type A** rules (evaluate signature `(node, virtualNode)`): port verbatim after `axe.setup()`.
```js
const vn = axe.utils.getNodeFromTree(node);
const role = axe.commons.aria.getRole(vn);
const name = axe.commons.text.accessibleText(vn);
const visible = axe.commons.dom.isVisible(node);
```

**Type B1/B2/C/AI** rules (evaluate signature `(nodeData, nodeDetails)` with `SHORTENED_KEY.*` fields): the worker doesn't see the live DOM &mdash; it receives a serialised snapshot. Rebuild that snapshot to faithfully reproduce judgement.

## nodeData reconstruction for Type B1/B2/C/AI

### Option A &mdash; rebuild from the virtual tree (preferred)

After `axe.setup()`, walk `axe.utils.getFlattenedTree()` and emit the exact fields the server expects. Inline `SHORTENED_KEY` as a literal object from `ip-protection/utils/constants.js`. Populate only what the rule's helpers read &mdash; grep `SHORTENED_KEY.` in `ip-protection/commons/*-helpers.js` for the rule. Common fields:

```
isVisible, offsetHeight, offsetWidth, tagName, nodeType, allAttributes,
children (selector array), parent, fullPathSelector,
computedStyle { display, listStyleType, backgroundImage, ... },
nodeTextContent, pseudoBefore{Text,Width,Height,Radius},
pseudoAfter{Text,Width,Height,Radius}
```

Then pass `(nodeData, nodeDetails)` to the ported evaluate with the real helpers inlined verbatim from `ip-protection/commons/`.

### Option B &mdash; stub only what the rule touches

For rules that read few fields, compute just those on the target + ancestors + children. Mark which fields are synthetic in the port.

### What not to do

- **Don't** replace `SHORTENED_KEY.*` reads with hand-written native-DOM reads &mdash; that's the divergence this exists to avoid.
- **Don't** rewrite commons helpers as "equivalent" native logic &mdash; inline them verbatim.

## Decision tree

```
Rule type = A, evaluate(node, virtualNode)?
  └── inject axe → setup → port calls axe.commons/utils directly.

Rule type = B1/B2/C/AI, evaluate(nodeData, nodeDetails)?
  ├── AI and non-AI routes exist? Ask user which mode was active.
  ├── Rebuild nodeData from axe virtual tree (Option A), inline helpers verbatim.
  │    Or stub the fields actually read (Option B), mark synthetic.
  └── Judgement is LLM-only (Type AI via workerAI)?
       └── port client pre-filter only; "needs server re-run".

Injection blocked (CSP / closed shadow / cross-origin iframe)?
  └── fall back to native-DOM port (script-conversion.md Path B).
```
