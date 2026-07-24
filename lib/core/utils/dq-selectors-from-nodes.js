import DqElement from './dq-element';

// a11y-critical: shared bulk-review helper — maps DOM nodes to DqElement
// selectors for visualHelperData; used by multiple review-enabled checks.

/**
 * Map DOM nodes to their DqElement CSS selectors, dropping falsy entries.
 * @param {Array<Node>} nodes
 * @returns {Array} selector for each resolvable node
 */
function dqSelectorsFromNodes(nodes) {
  return (nodes || [])
    .filter(Boolean)
    .map(node => new DqElement(node).selector);
}

export default dqSelectorsFromNodes;
