import { getNodeFromTree, memoize } from '../../core/utils';
import { sanitize } from '../text';
import { getIntersectionRect, getRectCenter, isPointInRect } from '../math';
import getOverflowHiddenAncestors from './get-overflow-hidden-ancestors';
import cache from '../../core/base/cache';

/**
 * Get the visible text client rects of a node.
 * @method getVisibleChildTextRects
 * @memberof axe.commons.dom
 * @instance
 * @param {Element} node
 */
const getVisibleChildTextRects = memoize(
  function getVisibleChildTextRectsMemoized(
    node,
    checkTextRectOutsideNodeBoundingRect = false,
    checkIsOutsideNodeBounds = true,
    includeOverflowHiddenRect = false
  ) {
    const vNode = getNodeFromTree(node);
    const nodeRect = vNode.boundingClientRect;
    const clientRects = [];
    const overflowHiddenNodes = getOverflowHiddenAncestors(vNode);

    node.childNodes.forEach(textNode => {
      if (textNode.nodeType !== 3 || sanitize(textNode.nodeValue) === '') {
        return;
      }

      const contentRects = getContentRects(textNode);
      if (checkIsOutsideNodeBounds) {
        if (
          isOutsideNodeBounds(
            contentRects,
            nodeRect,
            checkTextRectOutsideNodeBoundingRect
          ) &&
          !cache.get('ruleId')
        ) {
          return;
        }
      }

      if (includeOverflowHiddenRect) {
        clientRects.push(...filterHiddenRects(contentRects, []));
      } else {
        clientRects.push(
          ...filterHiddenRects(contentRects, overflowHiddenNodes)
        );
      }
    });

    // a11y-engine-domforge change
    if (
      clientRects.length <= 0 &&
      cache.get('ruleId') &&
      cache.get('ruleId') === 'resize-2x-zoom' &&
      checkIsOutsideNodeBounds
    ) {
      return [];
    }
    /**
     * if all text rects are larger than the bounds of the node,
     * or goes outside of the bounds of the node, we need to use
     * the nodes bounding rect so we stay within the bounds of the
     * element.
     *
     * @see https://github.com/dequelabs/axe-core/issues/2178
     * @see https://github.com/dequelabs/axe-core/issues/2483
     * @see https://github.com/dequelabs/axe-core/issues/2681
     *
     * also need to resize the nodeRect to fit within the bounds of any overflow: hidden ancestors.
     *
     * @see https://github.com/dequelabs/axe-core/issues/4253
     */
    return clientRects.length
      ? clientRects
      : filterHiddenRects([nodeRect], overflowHiddenNodes);
  }
);
export default getVisibleChildTextRects;

function getContentRects(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects());
}

/**
 * Check to see if the text rect size is outside the of the
 * nodes bounding rect. Since we use the midpoint of the element
 * when determining the rect stack we will also use the midpoint
 * of the text rect to determine out of bounds
 */
function isOutsideNodeBounds(
  rects,
  nodeRect,
  checkTextRectOutsideNodeBoundingRect = false
) {
  return rects.some(rect => {
    const centerPoint = getRectCenter(rect);
    if (checkTextRectOutsideNodeBoundingRect) {
      !isPointInRect(centerPoint, nodeRect) || rect.right > nodeRect.right;
    } else {
      return !isPointInRect(centerPoint, nodeRect);
    }
  });
}

/**
 * Filter out 0 width and height rects (newline characters) and
 * any rects that are outside the bounds of overflow hidden
 * ancestors
 */
function filterHiddenRects(contentRects, overflowHiddenNodes) {
  const visibleRects = [];
  contentRects.forEach(contentRect => {
    // ie11 has newline characters return 0.00998, so we'll say if the
    // line is < 1 it shouldn't be counted
    if (contentRect.width < 1 || contentRect.height < 1) {
      return;
    }

    // update the rect size to fit inside the bounds of all overflow
    // hidden ancestors
    const visibleRect = overflowHiddenNodes.reduce((rect, overflowNode) => {
      return rect && getIntersectionRect(rect, overflowNode.boundingClientRect);
    }, contentRect);

    if (visibleRect) {
      visibleRects.push(visibleRect);
    }
  });

  return visibleRects;
}
