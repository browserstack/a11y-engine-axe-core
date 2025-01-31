import autocompleteMatches from './autocomplete-matches';

function nodeIsASearchFunctionality(actualNode, currLevel = 0, maxLevels = 4) {
  if (!actualNode) {
    return false;
  }

  function currentLevelSearch(node, currentLevel) {
    if (!node || currentLevel > maxLevels) {
      return false;
    }

    let details = `\nLevel ${currentLevel}:\n`;

    //collecting all the HTML attributes
    details += 'Attributes:\n';
    if (node.hasAttributes()) {
      const attributes = axe.utils.getNodeAttributes(node);
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        details += `  ${attr.name}: ${attr.value}\n`;
      }
    }

    // Collect any associated labels (if node is an input, select, textarea, etc.)
    if (node.labels) {
      details += 'Labels:\n';
      for (let j = 0; j < node.labels.length; j++) {
        details += `  ${node.labels[j].innerText}\n`;
      }
    } else if (
      node.nodeName.toLowerCase() === 'input' &&
      node.type !== 'hidden'
    ) {
      const labels = document.querySelectorAll('label[for="' + node.id + '"]');
      details += 'Labels:\n';
      labels.forEach(label => {
        details += `  ${label.innerText}\n`;
      });
    }

    // Collect the given id
    details += `ID: ${node.id}\n`;
    // Collect all class names
    details += `Class Names: ${node.className
      .split(' ')
      .filter(name => name)
      .join(', ')}\n`;

    const regex = new RegExp('search', 'i');
    if (regex.test(details)) {
      return true;
    } else {
      return currentLevelSearch(node.parentElement, currentLevel + 1);
    }
  }
  return currentLevelSearch(actualNode, currLevel);
}

function quantityField(node) {
  const keywords = [
    'qty',
    'quantity',
    'quantities',
    'km',
    'kilometer',
    'drive',
    'code',
    'mileage',
    'power',
    'fuel'
  ];
  const attributes = [
    'name',
    'id',
    'title',
    'placeholder',
    'aria-label',
    'data-label',
    'data-title',
    'data-placeholder',
    'role'
  ];
  return attributes.some(attr => {
    if (node.hasAttribute(attr)) {
      const value = node.getAttribute(attr).toLowerCase();
      return keywords.some(
        keyword => value && value.includes(keyword.toLowerCase())
      );
    }
    return false;
  });
}

function isReadOnly(node) {
  return node.hasAttribute('readonly');
}

function isCombobox(node) {
  return node.getAttribute('role') === 'combobox';
}

function autocompleteA11yMatches(node, virtualNode) {
  const a11yEngineFlag = true;
  /* the flag is used to tell autocomplete matcher that it is being called 
  by a11y-engine and thus bypass an if block 
  The second condition is to check we are not matching with search functionality */
  return (
    autocompleteMatches(node, virtualNode, a11yEngineFlag) &&
    !nodeIsASearchFunctionality(node) &&
    !quantityField(node) &&
    !isReadOnly(node) &&
    !isCombobox(node)
  );
}

export default autocompleteA11yMatches;
