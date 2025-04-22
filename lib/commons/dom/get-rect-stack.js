import visuallySort from './visually-sort';
import { getRectCenter } from '../math';

// Additional props isCoordsPassed, x, y for a11y-engine-domforge
export function getRectStack(
  grid,
  rect,
  recursed = false,
  isCoordsPassed = false,
  x = null,
  y = null
) {
  const center = getRectCenter(rect);
  const gridCell = grid.getCellFromPoint(center) || [];

  let floorX = Math.floor(center.x);
  let floorY = Math.floor(center.y);

  // a11y-engine-domforge change
  if (isCoordsPassed) {
    floorX = Math.floor(x);
    floorY = Math.floor(y);
  }

  let stack = gridCell.filter(gridCellNode => {
    return gridCellNode.clientRects.some(clientRect => {
      const rectX = clientRect.left;
      const rectY = clientRect.top;

      // perform an AABB (axis-aligned bounding box) collision check for the
      // point inside the rect
      // account for differences in how browsers handle floating point
      // precision of bounding rects
      return (
        floorX < Math.floor(rectX + clientRect.width) &&
        floorX >= Math.floor(rectX) &&
        floorY < Math.floor(rectY + clientRect.height) &&
        floorY >= Math.floor(rectY)
      );
    });
  });

  const gridContainer = grid.container;
  //adding just if color contrast is being run then only then the extra added condition should run
  if (gridContainer) {
    stack = getRectStack(
      gridContainer._grid,
      gridContainer.boundingClientRect,
      true
    ).concat(stack);
  }

  if (!recursed) {
    stack = stack
      .sort(visuallySort)
      .map(vNode => vNode.actualNode)
      // always make sure html is the last element
      .concat(document.documentElement)
      // remove duplicates caused by adding client rects of the same node
      .filter((node, index, array) => array.indexOf(node) === index);
  }

  return stack;
}
