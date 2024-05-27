import autocompleteMatches from './autocomplete-matches';

function nodeIsASearchFunctionality(node, currLevel=0, maxLevels=4) {
  if(!node) {
      return false;
  }

  function currentLevelSearch(node, currentLevel) {
      if(!node || currentLevel > maxLevels) {
          return false;
      }

      let details = `\nLevel ${currentLevel}:\n`;

      //collecting all the HTML attributes
      details += "Attributes:\n";
      if(node.hasAttributes()) {
        const attributes = axe.utils.getNodeAttributes(node);
        for (let i = 0; i < attributes.length; i++) {
            let attr = attributes[i];
            details += `  ${attr.name}: ${attr.value}\n`;
        }
      }
      
      // Collect any associated labels (if node is an input, select, textarea, etc.)
      if (node.labels) {
          details += "Labels:\n";
          for (let j = 0; j < node.labels.length; j++) {
              details += `  ${node.labels[j].innerText}\n`;
          }
      } else if (node.nodeName.toLowerCase() === 'input' && node.type !== 'hidden') {
          let labels = document.querySelectorAll('label[for="' + node.id + '"]');
          details += "Labels:\n";
          labels.forEach(label => {
              details += `  ${label.innerText}\n`;
          });
      }

      // Collect the given id
      details += `ID: ${node.id}\n`;
      // Collect all class names
      details += `Class Names: ${node.className.split(' ').filter(name => name).join(', ')}\n`;

      const regex = new RegExp('search', 'i');
      if(regex.test(details)) {
          return true;
      } else {
          currentLevelSearch(node.parentElement, currentLevel + 1);
      }
  }
  return currentLevelSearch(node, currLevel);
}

function autocompleteA11yMatches(node, virtualNode) {  
  const a11yEngineFlag = true;
  /* the flag is used to tell autocomplete matcher that it is being called 
  by a11y-engine and thus bypass an if block 
  The second condition is to check we are not matching with search functionality */
  return (autocompleteMatches(node, virtualNode, a11yEngineFlag) && !nodeIsASearchFunctionality(node));
}

export default autocompleteA11yMatches;
