// port-skeleton.js — copy to /tmp/debug-fp-<rule-id>.js and fill in.
// Contract: IIFE that returns { decision, reasons, observed }. Never a DOM node.
// Assumes axe is injected and axe.setup(document) has been called by run-with-axe.js.
// Port is responsible for axe.teardown() in finally.
//
// TARGET_SELECTORS is ALWAYS an array. Single-selector case = one-element array.
// The script queries every selector, then deduplicates by DOM node identity so
// an element reported via multiple CSS paths collapses to one verdict entry.
(() => {
  const TARGET_SELECTORS = ['__REPLACE_ME__'];

  const reasons = [];
  const observed = {
    selectors: TARGET_SELECTORS,
    selectorMatches: {},   // selector -> matchCount, for debug
    elements: [],          // one entry per UNIQUE element
    errors: [],
  };

  // Gather unique nodes; remember which selectors each came from.
  const nodeToSelectors = new Map();
  for (const sel of TARGET_SELECTORS) {
    let matches;
    try { matches = Array.from(document.querySelectorAll(sel)); }
    catch (e) { observed.errors.push({ selector: sel, msg: 'invalid selector: ' + e.message }); continue; }
    observed.selectorMatches[sel] = matches.length;
    for (const n of matches) {
      if (!nodeToSelectors.has(n)) nodeToSelectors.set(n, []);
      nodeToSelectors.get(n).push(sel);
    }
  }
  if (nodeToSelectors.size === 0) {
    return { decision: 'undefined (no elements matched)', reasons: ['TARGET_SELECTORS matched nothing'], observed };
  }

  try {
    if (!window.axe) { observed.errors.push('axe not injected'); return { decision: 'undefined (no axe)', reasons, observed }; }

    for (const [node, selectorsThatFound] of nodeToSelectors) {
      const entry = {
        matchedBy: selectorsThatFound,           // all selectors that resolved to this node
        duplicatedAcrossSelectors: selectorsThatFound.length > 1,
        tag: node.tagName,
        id: node.id || null,
        classes: Array.from(node.classList),
        outerHTML: (node.outerHTML || '').slice(0, 300),
        textContent: (node.textContent || '').trim().slice(0, 200),
        branches: {},
        verdict: null,
      };

      // ---- PATH A (preferred): call axe.commons/utils directly ----
      // const virtualNode = axe.utils.getNodeFromTree(node);
      // const role = axe.commons.aria.getRole(virtualNode);
      // const name = axe.commons.text.accessibleText(virtualNode);
      // entry.branches.role = role;
      // entry.branches.accessibleName = name;
      // entry.verdict = name ? 'pass' : 'violation';

      // ---- Type C / AI: rebuild nodeData from axe virtual tree, then call real helpers ----
      // See references/axe-injection.md §"Data-collection parity for Type C / AI rules".
      // Inline SHORTENED_KEY literal + ip-protection/commons/<rule>-helpers.js verbatim.

      observed.elements.push(entry);
    }

    reasons.push(`inspected ${observed.elements.length} unique element(s)`);
    return { decision: 'see observed.elements[].verdict', reasons, observed };
  } catch (e) {
    observed.errors.push({ msg: String(e && e.message || e), stack: (e && e.stack || '').slice(0, 400) });
    return { decision: 'undefined (check errored)', reasons, observed };
  } finally {
    try { if (window.axe && axe.teardown) axe.teardown(); } catch (_) { /* ignore */ }
  }
})()
