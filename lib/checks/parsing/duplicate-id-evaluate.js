import { getRootNode } from '../../commons/dom';
import { escapeSelector } from '../../core/utils';

function duplicateIdEvaluate(node, options = {}) {
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

  // a11y-rule-duplicate-id-aria: emit duplicate id + sharing elements for bulk review when enabled.
  if (options.reviewPayload) {
    const verdict = matchingNodes.length === 0;
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

  this.data(id);

  return matchingNodes.length === 0;
}

export default duplicateIdEvaluate;
