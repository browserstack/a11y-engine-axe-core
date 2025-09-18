import getSelector from './get-selector';
import getAncestry from './get-ancestry';
import getXpath from './get-xpath';
import getNodeFromTree from './get-node-from-tree';
import AbstractVirtualNode from '../base/virtual-node/abstract-virtual-node';
import cache from '../base/cache';

const CACHE_KEY = 'DqElm.RunOptions';

function truncate(str, maxLength) {
  maxLength = maxLength || 300;

  if (str.length > maxLength) {
    var index = str.indexOf('>');
    str = str.substring(0, index + 1);
  }

  return str;
}

/**
 * Escapes a string for use in CSS selectors
 * @param {String} str - The string to escape
 * @returns {String} The escaped string
 */
function escapeCSSSelector(str) {
  // Use the CSS.escape method if available
  if (window.CSS && window.CSS.escape) {
    return window.CSS.escape(str);
  }
  // Simple fallback for browsers that don't support CSS.escape
  return str
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&')
    .replace(/^\d/, '\\3$& ');
}
function generateSelectorWithShadow(elm) {
  const selectors = getShadowSelector(elm);
  if (typeof selectors === 'string') {
    return selectors;
  } else {
    // merge selectors of an array with ,
    return selectors.join(',').replace(/,$/, '');
  }
}

function getShadowSelector(elm) {
  if (!elm) {
    return '';
  }
  let doc = (elm.getRootNode && elm.getRootNode()) || document;
  // Not a DOCUMENT_FRAGMENT - shadow DOM
  if (doc.nodeType !== 11) {
    return getFullPathSelector(elm);
  }

  const stack = [];
  while (doc.nodeType === 11) {
    if (!doc.host) {
      return '';
    }
    stack.unshift({ elm, doc });
    elm = doc.host;
    doc = elm.getRootNode();
  }

  stack.unshift({ elm, doc });
  return stack.map(item => getFullPathSelector(item.elm));
}

function getFullPathSelector(elm) {
  if (elm.nodeName === 'HTML' || elm.nodeName === 'BODY') {
    return elm.nodeName.toLowerCase();
  }

  if (cache.get('getFullPathSelector') === undefined) {
    cache.set('getFullPathSelector', new WeakMap());
  }

  // Check cache first
  const sourceCache = cache.get('getFullPathSelector');
  if (sourceCache.has(elm)) {
    return sourceCache.get(elm);
  }

  const element = elm;
  const names = [];
  while (elm.parentElement && elm.nodeName !== 'BODY') {
    if (sourceCache.has(elm)) {
      names.unshift(sourceCache.get(elm));
      break;
    } else if (elm.id) {
      // Check if the ID is unique in the document before using it
      const escapedId = escapeCSSSelector(elm.getAttribute('id'));
      const elementsWithSameId = document.querySelectorAll(`#${escapedId}`);
      if (elementsWithSameId.length === 1) {
        // ID is unique, safe to use
        names.unshift('#' + escapedId);
        break;
      } else {
        // ID is not unique, fallback to position-based selector
        let c = 1;
        let e = elm;
        for (; e.previousElementSibling; e = e.previousElementSibling, c++) {
          // Increment counter for each previous sibling
        }
        names.unshift(`${elm.nodeName.toLowerCase()}:nth-child(${c})`);
      }
    } else {
      let c = 1;
      let e = elm;
      for (; e.previousElementSibling; e = e.previousElementSibling, c++) {
        // Increment counter for each previous sibling
      }
      names.unshift(`${elm.nodeName.toLowerCase()}:nth-child(${c})`);
    }
    elm = elm.parentElement;
  }

  const selector = names.join('>');
  sourceCache.set(element, selector);
  return selector;
}

function getSourceOpt(element) {
  if (!element) {
    return '';
  }

  // Initialize cache if needed
  if (cache.get('getSourceEfficient') === undefined) {
    cache.set('getSourceEfficient', new WeakMap());
  }

  // Check cache first
  const sourceCache = cache.get('getSourceEfficient');
  if (sourceCache.has(element)) {
    return sourceCache.get(element);
  }

  // Compute value if not cached
  const tagName = element.nodeName?.toLowerCase();
  if (!tagName) {
    return '';
  }

  let result;
  try {
    const attributes = Array.from(element.attributes || [])
      .filter(attr => !attr.name.startsWith('data-percy-'))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(' ');
    const closingTag = element.children.length ? false : true;
    if (closingTag) {
      result = `<${tagName} ${attributes}>${element.textContent}</${tagName}>`;
    } else {
      result = attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;
    }
    result = truncate(result, 300); // Truncate to 300 characters
    // Store in cache
    sourceCache.set(element, result);
  } catch (e) {
    // Handle potential errors (like accessing attributes on non-element nodes)
    result = `<${tagName || 'unknown'}>`;
  }

  return result;
}

function getSource(element) {
  if (!element?.outerHTML) {
    return '';
  }
  var source = element.outerHTML;
  if (!source && typeof window.XMLSerializer === 'function') {
    source = new window.XMLSerializer().serializeToString(element);
  }
  let htmlString = truncate(source || '');
  // Remove unwanted attributes
  const regex = /\s*data-percy-[^=]+="[^"]*"/g;
  htmlString = htmlString.replace(regex, '');
  return htmlString;
}

/**
 * "Serialized" `HTMLElement`. It will calculate the CSS selector,
 * grab the source (outerHTML) and offer an array for storing frame paths
 * @param {HTMLElement} element The element to serialize
 * @param {Object} options Propagated from axe.run/etc
 * @param {Object} spec Properties to use in place of the element when instantiated on Elements from other frames
 */
function DqElement(elm, options = null, spec = {}) {
  if (!options) {
    options = cache.get(CACHE_KEY) ?? {};
  }

  this.spec = spec;
  if (elm instanceof AbstractVirtualNode) {
    this._virtualNode = elm;
    this._element = elm.actualNode;
  } else {
    this._element = elm;
    this._virtualNode = getNodeFromTree(elm);
  }

  /**
   * Whether DqElement was created from an iframe
   * @type {boolean}
   */
  this.fromFrame = this.spec.selector?.length > 1;

  this._includeElementInJson = options.elementRef;

  if (options.absolutePaths) {
    this._options = { toRoot: true };
  }

  /**
   * Number by which nodes in the flat tree can be sorted
   * @type {Number}
   */
  this.nodeIndexes = [];
  if (Array.isArray(this.spec.nodeIndexes)) {
    this.nodeIndexes = this.spec.nodeIndexes;
  } else if (typeof this._virtualNode?.nodeIndex === 'number') {
    this.nodeIndexes = [this._virtualNode.nodeIndex];
  }

  /**
   * The generated HTML source code of the element
   * @type {String|null}
   */
  this.source = null;
  // TODO: es-modules_audit
  if (!axe._audit.noHtml) {
    if (axe._cache.get('runTypeAOpt')) {
      this.source = this.spec.source ?? getSourceOpt(this._element);
    } else {
      this.source = this.spec.source ?? getSource(this._element);
    }
  }
}

DqElement.prototype = {
  /**
   * A unique CSS selector for the element, designed for readability
   * @return {String}
   */
  get selector() {
    if (axe._cache.get('targetFormat') === 'ancestry') {
      return this.spec.selector || [getAncestry(this.element)];
    }
    if (axe._cache.get('runTypeAOpt')) {
      return this.spec.selector || [generateSelectorWithShadow(this.element)];
    }
    return this.spec.selector || [getSelector(this.element, this._options)];
  },

  /**
   * A unique CSS selector for the element, including its ancestors down to the root node
   * @return {String}
   */
  get ancestry() {
    return this.spec.ancestry || [getAncestry(this.element)];
  },

  /**
   * Xpath to the element
   * @return {String}
   */
  get xpath() {
    return this.spec.xpath || [getXpath(this.element)];
  },

  /**
   * Direct reference to the `HTMLElement` wrapped by this `DQElement`.
   */
  get element() {
    return this._element;
  },

  /**
   * Converts to a "spec", a form suitable for use with JSON.stringify
   * (*not* to pre-stringified JSON)
   * @returns {Object}
   */
  toJSON() {
    const spec = {
      selector: this.selector,
      source: this.source,
      xpath: this.xpath,
      ancestry: this.ancestry,
      nodeIndexes: this.nodeIndexes,
      fromFrame: this.fromFrame
    };
    if (this._includeElementInJson) {
      spec.element = this._element;
    }
    return spec;
  }
};

DqElement.fromFrame = function fromFrame(node, options, frame) {
  const spec = DqElement.mergeSpecs(node, frame);
  return new DqElement(frame.element, options, spec);
};

DqElement.mergeSpecs = function mergeSpecs(child, parentFrame) {
  // Parameter order reversed for backcompat
  return {
    ...child,
    selector: [...parentFrame.selector, ...child.selector],
    ancestry: [...parentFrame.ancestry, ...child.ancestry],
    xpath: [...parentFrame.xpath, ...child.xpath],
    nodeIndexes: [...parentFrame.nodeIndexes, ...child.nodeIndexes],
    fromFrame: true
  };
};

/**
 * Set the default options to be used
 * @param {Object} RunOptions Options passed to axe.run()
 * @property {boolean} elementRef Add element when toJSON is called
 * @property {boolean} absolutePaths Use absolute path fro selectors
 */
DqElement.setRunOptions = function setRunOptions({
  elementRef,
  absolutePaths
}) {
  cache.set(CACHE_KEY, { elementRef, absolutePaths });
};

export default DqElement;
