# Rule → browser-port conversion

The original check runs inside axe's virtual tree with ES modules, commons helpers, and ErrorHandler. The port runs as plain JS in the page.

**Two paths; prefer A.** Path B only when axe can't be injected.

## Path A &mdash; inject axe, call commons directly

For **Type A** rules (axe-core / a11y-engine-core): inject the forked axe bundle, call `axe.setup()`, then the port calls `axe.commons.*` / `axe.utils.*` verbatim &mdash; the way the scanner does at runtime.

For **Type B1/B2/C/AI** rules: inject axe, rebuild the `nodeData` snapshot the server worker consumes (walking `axe.utils.getFlattenedTree()`), and feed the real `ip-protection/commons/*-helpers.js` helpers unchanged. This closes the largest source of port divergence (hand-written visibility / pseudo-element / text-content checks that drift from the real capture path).

Bundle path, `axe.setup()`/`axe.teardown()` lifecycle, `nodeData` reconstruction: `axe-injection.md`.

## Path B &mdash; native-DOM fallback

Use only when axe injection fails: strict CSP, sandboxed iframes, trusted types. Lossier than A &mdash; document in the verdict. Substitution table below.

## Hard rules (both paths)

1. **IIFE returning JSON** &mdash; `Runtime.evaluate` with `returnByValue: true` throws on DOM nodes / functions / cyclic refs.
2. **No `import` / `export`** &mdash; inline helpers.
3. **No `console.log`** in the happy path &mdash; all data rides the return value.
4. **Never return a DOM node** &mdash; serialise as `{ tag, id, classes, outerHTML }`.
5. **`axe.teardown()` in `finally`** (Path A).

## Substitution table (Path B only)

| Original | Native-DOM replacement |
|---|---|
| `axe.commons.dom.getRootNode(node)` | `node.getRootNode()` |
| `axe.commons.dom.isVisible(node)` | `const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none'` |
| `axe.commons.aria.getRole(node)` | `node.getAttribute('role') \|\| null` (sufficient for FP checks; inline implicit-role map if needed) |
| `axe.commons.text.accessibleText(node)` | inline: `aria-labelledby` &rarr; `aria-label` &rarr; `<label for>` &rarr; `.textContent.trim()` &rarr; `title` &rarr; `placeholder` |
| `axe.utils.querySelectorAll(vn, sel)` | `Array.from(vn.actualNode.querySelectorAll(sel)).map(n => ({ actualNode: n }))` |
| `axe.utils.getNodeFromTree(node)` | `{ actualNode: node }` |
| `virtualNode.actualNode` | just `node` |
| `ErrorHandler.addCheckError(id, err)` | `observed.errors.push({ id, msg: String(err?.message \|\| err) })` |
| `import X from '…'` | delete; inline helpers |
| `export default fn` | `(fn)(TARGET)` inside the IIFE |

## Return contract

```json
{
  "decision": true | false | "undefined (…)",
  "reasons": ["branch name that set the decision"],
  "observed": {
    "selector": "<selector>",
    "target": { "tag": "LABEL", "id": "foo", "classes": ["bar"], "outerHTML": "…(first 300)" },
    "branches": { "ariaLabel": "…", "title": "…", "…": "branch fields that explain the verdict" },
    "errors": []
  }
}
```

`decision`: `true` = pass, `false` = fail (violation), `"undefined (…)"` = check errored.

## Port skeleton

Use `templates/port-skeleton.js` (multi-selector-aware; dedupes by DOM identity). It covers both paths &mdash; fill in the Path A (axe.commons) or Path B (native DOM) body where commented. Path B mode: skip the `if (!window.axe)` block and omit `axe.teardown()`.

## Worked example &mdash; `label-empty`

### Path A
```js
const virtualNode = axe.utils.getNodeFromTree(node);
const name = axe.commons.text.accessibleText(virtualNode);
observed.branches.accessibleName = name || null;
if (name && name.trim().length > 0) {
  reasons.push('accessibleText non-empty — PASS');
  return { decision: true, reasons, observed };
}
```
Axe handles the full spec (`aria-labelledby`, wrapping `<label>`, ARIA fallbacks) &mdash; same implementation as the scanner.

### Path B
Only checks `aria-label` + `title`. Missing `aria-labelledby`, wrapping `<label>`, etc. &mdash; exactly the divergence Path A avoids. If you can't use Path A, document what's missing in the verdict.

## Shadow DOM / iframes

- `document.querySelector` does not pierce closed shadow roots. Inject a pierce helper:
  ```js
  function pierce(root, sel) {
    const m = root.querySelector(sel); if (m) return m;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) {
      const hit = pierce(el.shadowRoot, sel); if (hit) return hit;
    }
    return null;
  }
  ```
- Same-origin iframes: use `frames[i].document`.
- Cross-origin iframes: unreachable via the Chrome integration. Document as inconclusive.

## Server-only / LLM logic

Do not fake; return `decision: 'undefined (server-only logic)'`. Includes screenshot pipelines, Gemini calls (`workerAI`), puppeteer-driven dom-forge manipulations, BullMQ dispatch.
