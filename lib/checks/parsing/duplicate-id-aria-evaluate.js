import { getRootNode } from '../../commons/dom';
import { escapeSelector } from '../../core/utils';

/**
 * Mirrors `duplicate-id-evaluate`, but additionally emits a `reviewPayload`
 * for the bulk-review "Review Duplicate IDs" visual helper. Kept separate so
 * the non-bulk-review `duplicate-id` / `duplicate-id-active` checks (which
 * share `duplicate-id-evaluate`) are untouched.
 */
function duplicateIdAriaEvaluate(node) {
  const id = node.getAttribute('id').trim();
  // Since empty ID's are not meaningful and are ignored by Edge, we'll
  // let those pass.
  if (!id) {
    return true;
  }
  const root = getRootNode(node);
  const matchingNodes = Array.from(
    root.querySelectorAll(`[id="${escapeSelector(id)}"]`)
  ).filter(foundNode => foundNode !== node);

  if (matchingNodes.length) {
    this.relatedNodes(matchingNodes);
  }

  // Verdict is computed independently of the emit below.
  const verdict = matchingNodes.length === 0;

  // a11y-rule-duplicate-id-aria: surface the duplicate id and the other
  // elements sharing it for the visual helper. Reuse `DqElement.selector`
  // (the same path `relatedNodes` serializes with) so the list matches the
  // reported nodes; no new lookup. Emit only when a duplicate exists, and
  // wrapped so any failure to build the payload can never fail the check/scan
  // (the `id` is always carried for the fail message).
  const data = { id };
  try {
    if (matchingNodes.length) {
      data.reviewPayload = {
        visualHelperData: {
          duplicateId: id,
          elements: matchingNodes
            .filter(Boolean)
            .map(foundNode => new axe.utils.DqElement(foundNode).selector)
        }
      };
    }
  } catch {
    // best-effort emit — preserve the scan result
  }
  this.data(data);

  return verdict;
}

export default duplicateIdAriaEvaluate;
