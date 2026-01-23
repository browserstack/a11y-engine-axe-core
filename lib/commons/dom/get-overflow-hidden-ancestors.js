import cache from '../../core/base/cache';
import memoize from '../../core/utils/memoize';

/**
 * Get all ancestor nodes (including the passed in node) that have overflow:hidden
 * @method getOverflowHiddenAncestors
 * @memberof axe.commons.dom
 * @param {VirtualNode} vNode
 * @returns {VirtualNode[]}
 */
const getOverflowHiddenAncestors = memoize(
  function getOverflowHiddenAncestorsMemoized(vNode) {
    const ancestors = [];

    if (!vNode) {
      return ancestors;
    }

    const overflow = vNode.getComputedStylePropertyValue('overflow');

    // a11y-domforge : special handling for resize-2x-zoom rule
    if (cache.get('ruleId') && cache.get('ruleId') === 'resize-2x-zoom') {
      if (
        overflow.includes('hidden') ||
        overflow.includes('clip') ||
        overflow.includes('scroll') ||
        overflow.includes('auto')
      ) {
        ancestors.push(vNode);
      }
    } 
    // a11y-domforge : special handling for reflow-4x-zoom-scroll and color-contrast rules
    else if (
      cache.get('ruleId') &&
      (cache.get('ruleId') === 'reflow-4x-zoom-scroll' ||
        cache.get('ruleId') === 'color-contrast') &&
      overflow.includes('hidden')
    ) {
      ancestors.push(vNode);
    } else if (overflow === 'hidden' || overflow.includes('clip')) {
      ancestors.push(vNode);
    }

    return ancestors.concat(getOverflowHiddenAncestors(vNode.parent));
  }
);

export default getOverflowHiddenAncestors;
