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

    // a11y-engine-domforge change
    if (cache.get('ruleId') && cache.get('ruleId') === 'resize-2x-zoom') {
      if (
        overflow.includes('hidden') ||
        overflow.includes('clip') ||
        overflow.includes('scroll')
      ) {
        ancestors.push(vNode);
      }
    } else if (
      cache.get('ruleId') &&
      cache.get('ruleId') === 'reflow' &&
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
