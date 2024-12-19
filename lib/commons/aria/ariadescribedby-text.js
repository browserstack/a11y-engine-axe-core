/**
 * Get the accessible name based on aria-describedby
 *
 * @deprecated Do not use Element directly. Pass VirtualNode instead
 * @param {VirtualNode|Element} element
 * @param {Object} context
 * @property {Bool} inLabelledByContext Whether or not the lookup is part of aria-describedby reference
 * @property {Bool} inControlContext Whether or not the lookup is part of a native label reference
 * @property {Element} startNode First node in accessible name computation
 * @property {Bool} debug Enable logging for formControlValue
 * @return {string} Concatenated text value for referenced elements
 */
function ariadescribedbyText(element, context = {}) {
  const { vNode } = axe.utils.nodeLookup(element);
  if (vNode?.props.nodeType !== 1) {
    return '';
  }

  if (
    vNode.props.nodeType !== 1 ||
    context.inLabelledByContext ||
    context.inControlContext ||
    !vNode.attr('aria-describedby')
  ) {
    return '';
  }

  const refs = axe.commons.dom
    .idrefs(vNode, 'aria-describedby')
    .filter(elm => elm);
  return refs.reduce((accessibleName, elm) => {
    const accessibleNameAdd = axe.commons.text.accessibleText(elm, {
      // Prevent the infinite reference loop:
      inLabelledByContext: true,
      startNode: context.startNode || vNode,
      ...context
    });

    if (!accessibleName) {
      return accessibleNameAdd;
    }
    return `${accessibleName} ${accessibleNameAdd}`;
  }, '');
}

export default ariadescribedbyText;
