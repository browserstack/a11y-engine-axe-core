import { getRectStack } from './get-rect-stack';
import { getNodeFromTree } from '../../core/utils';
import getNodeGrid from './get-node-grid';

/**
 * Return all elements that are at the center bounding rect of the passed in node.
 * @method getElementStack
 * @memberof axe.commons.dom
 * @param {Node} node
 * @return {Node[]}
 */

// Additional props isCoordsPassed, x, y for a11y-engine-domforge
function getElementStack(node, isCoordsPassed = false, x = null, y = null) {
  const grid = getNodeGrid(node);
  if (!grid) {
    return [];
  }
  const rect = getNodeFromTree(node).boundingClientRect;

  // Additional props isCoordsPassed, x, y for a11y-engine-domforge
  return getRectStack(grid, rect, false, isCoordsPassed, x, y);
}

export default getElementStack;
