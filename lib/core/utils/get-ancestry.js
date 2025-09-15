import getShadowSelector from './get-shadow-selector';

function generateAncestry(node) {
  const nodeName = node.nodeName.toLowerCase();
  const parent = node.parentElement;
  if (!parent) {
    return nodeName;
  }

  let nthChild = '';
  if (
    nodeName !== 'head' &&
    nodeName !== 'body' &&
    parent.children.length > 1
  ) {
    let index = 0;
    if (parent.nodeName === 'BODY') {
      let count = 0;
      // Single pass over siblings: count valid children & locate node position.
      for (
        let sib = parent.firstElementChild;
        sib;
        sib = sib.nextElementSibling
      ) {
        if (sib.hasAttribute('data-percy-injected')) {
          continue;
        }
        count++;
        if (sib === node) {
          index = count;
          break;
        }
      }
      nthChild = count > 1 ? `:nth-child(${index})` : '';
    } else {
      index = Array.prototype.indexOf.call(parent.children, node) + 1;
      nthChild = `:nth-child(${index})`;
    }
  }

  return generateAncestry(parent) + ' > ' + nodeName + nthChild;
}

/**
 * Gets a unique CSS selector
 * @param {HTMLElement} node The element to get the selector for
 * @param {Object} optional options
 * @returns {String|Array<String>} Unique CSS selector for the node
 */
export default function getAncestry(elm, options) {
  return getShadowSelector(generateAncestry, elm, options);
}
