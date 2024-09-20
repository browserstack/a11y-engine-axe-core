import { getRectStack } from './get-rect-stack';
import { getNodeFromTree } from '../../core/utils';
import createGrid from './create-grid';

/**
 * Return all elements that are at the center bounding rect of the passed in node.
 * @method getElementStack
 * @memberof axe.commons.dom
 * @param {Node} node
 * @return {Node[]}
 */

// Additional props isCoordsPassed, x, y for a11y-engine-domforge
function getElementStack(node, isCoordsPassed = false, x = null, y = null) {
  createGrid();

  const vNode = getNodeFromTree(node);
  const grid = vNode._grid;

  if (!grid) {
    return [];
  }

  // Additional props isCoordsPassed, x, y for a11y-engine-domforge
  return getRectStack(
    grid,
    vNode.boundingClientRect,
    false,
    isCoordsPassed,
    x,
    y
  );
}

export default getElementStack;
