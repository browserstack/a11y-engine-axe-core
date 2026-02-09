import getShadowSelector from './get-shadow-selector';

function generateAncestry(node) {
  const nodeName = node.nodeName.toLowerCase();
  const parentElement = node.parentElement;
  // eslint-disable-next-line no-unused-vars
  const parentNode = node.parentNode;

  let nthChild = '';
  if (
    nodeName !== 'head' &&
    nodeName !== 'body' &&
    parentElement?.children.length > 1
  ) {
    let index = 0;
    // a11y-critical : change to ignore injected Percy elements when calculating :nth-child
    if (parentElement.nodeName === 'BODY') {
      let count = 0;
      // Single pass over siblings: count valid children & locate node position.
      for (
        let sib = parentElement.firstElementChild;
        sib;
        sib = sib.nextElementSibling
      ) {
        if (sib.hasAttribute('data-percy-injected')) {
          continue;
        }
        count++;
        if (sib === node) {
          index = count;
        }
      }
      nthChild = count > 1 ? `:nth-child(${index})` : '';
    } else {
      index = Array.prototype.indexOf.call(parentElement.children, node) + 1;
      nthChild = `:nth-child(${index})`;
    }
  }

  if (!parentElement) {
    return nodeName + nthChild;
  }

  return generateAncestry(parentElement) + ' > ' + nodeName + nthChild;
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
