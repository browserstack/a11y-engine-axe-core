import { isValidAutocomplete } from '../../commons/text';

function checkIsElementValidAutocomplete(node, options, virtualNode) {
  const autocomplete = virtualNode.attr('autocomplete')?.toLowerCase().trim();
  // if element has autocomplete attribute as off then it is not a violation
  if (autocomplete === 'off' || autocomplete === 'chrome-off') {
    return true;
  }

  const nodename = node.nodeName.toLowerCase();
  if (!autocomplete && (nodename === 'select' || nodename === 'textarea')) {
    return true;
  }

  // if it is on then we check whether name / id have valid autocomplete value or not
  // same for the case if autocomplete is not present or has a non-standard value
  if (
    !autocomplete ||
    autocomplete === 'on' ||
    !isValidAutocomplete(autocomplete, options)
  ) {
    const name = virtualNode.attr('name');
    const id = virtualNode.attr('id');
    if (
      (name && isValidAutocomplete(name, options)) ||
      (id && isValidAutocomplete(id, options))
    ) {
      return true;
    }
    return false;
  }

  // if element autocomplete attribute is neither off nor on then we check if its a standard value
  if (isValidAutocomplete(autocomplete, options)) {
    return true;
  }

  return false;
}

function autocompleteA11yEvaluate(node, options, virtualNode) {
  try {
    const autocomplete = virtualNode.attr('autocomplete');

    // check if the autocomplete applicable element is inside form or exist freely
    const closestForm = virtualNode.actualNode.closest('form');

    //if it exists inside the form and autocomplete for form is off
    if (
      closestForm &&
      (closestForm.getAttribute('autocomplete')?.toLowerCase().trim() ===
        'off' ||
        closestForm.getAttribute('autocomplete')?.toLowerCase().trim() ===
          'chrome-off')
    ) {
      // if autocomplete attribute is not present for element then its a pass in this scenario
      // otherwise check all posibilities with the method
      return autocomplete
        ? checkIsElementValidAutocomplete(node, options, virtualNode)
        : true;
    } else {
      // The else case is if form is present and it has autocomplete as on or not set and
      // the other case this handles is that element exists independently

      // this method would check for all posibilities
      return checkIsElementValidAutocomplete(node, options, virtualNode);
    }
  } catch (err) {
    a11yEngine.errorHandler.addCheckError(
      'autocomplete-attribute-valid-check',
      err
    );
    return undefined;
  }
}

export default autocompleteA11yEvaluate;
