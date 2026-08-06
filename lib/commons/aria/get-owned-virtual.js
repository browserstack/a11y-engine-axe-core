import idrefs from '../dom/idrefs';

/**
 * Get an element's owned elements
 *
 * @param {VirtualNode} element
 * @return {VirtualNode[]} Owned elements
 */
function getOwnedVirtual(virtualNode) {
  const { actualNode, children } = virtualNode;
  if (!children) {
    throw new Error('getOwnedVirtual requires a virtual node');
  }
  // TODO: Check that the element has a role
  // TODO: Descend into children with role=presentation|none
  // TODO: Exclude descendents owned by other elements
  if (virtualNode.hasAttr('aria-owns')) {
    // [a11y-critical]: getNodeFromTree returns undefined for a ref outside the
    // current tree, so the resolved nodes need filtering too, not just the refs
    const owns = idrefs(actualNode, 'aria-owns')
      .filter(element => !!element)
      .map(element => axe.utils.getNodeFromTree(element))
      .filter(vNode => !!vNode);
    return [...children, ...owns];
  }

  return [...children];
}

export default getOwnedVirtual;
