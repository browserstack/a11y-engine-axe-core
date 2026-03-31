// Dual FNV-1a 32-bit hash — two independent passes with different seeds,
// concatenated into a 16-character hex string for ~64-bit collision resistance.
function fnvHash(str) {
  let h1 = 0x811c9dc5; // FNV offset basis (seed 1)
  let h2 = 0x050c5d1f; // Different offset basis (seed 2)
  const FNV_PRIME = 0x01000193;
   
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    h1 = ((h1 ^ c) * FNV_PRIME) | 0;
    // eslint-disable-next-line no-bitwise
    h2 = ((h2 ^ c) * FNV_PRIME) | 0;
  }
  // eslint-disable-next-line no-bitwise
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  // eslint-disable-next-line no-bitwise
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return part1 + part2;
}

// --- Positional style properties to exclude from fingerprint ---
const POSITIONAL_PROPERTIES = new Set([
  'top',
  'left',
  'right',
  'bottom',
  'position',
  'transform',
  'translate',
  'rotate',
  'scale',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'inset',
  'inset-block',
  'inset-inline',
  'z-index',
  'x',
  'y'
]);

// --- Void elements (self-closing, no children) ---
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

// --- CSS-in-JS dynamic class regex ---
// Matches: css-1a2b3c4d, sc-bdVTJa1, emotion-s1h4d7
// Does not match: css-reset, btn-primary
const CSS_IN_JS_REGEX = /^[a-zA-Z][\w-]*-(?=[a-zA-Z0-9]*\d)[a-zA-Z0-9]{6,}$/;

// (React synthetic ID and hash-based ID regexes removed — not needed
// since ID is not in the 13-field fingerprint spec)

// --- HTML entity decoding ---
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// --- Extract opening tag from outerHTML ---
function extractOpeningTag(outerHTML) {
  const match = outerHTML.match(/^<[^>]+>/);
  return match ? match[0] : '';
}

// --- Extract tag name ---
function extractTagName(outerHTML) {
  const match = outerHTML.match(/^<(\w+)/);
  return match ? match[1].toLowerCase() : '';
}

// --- Extract a single attribute value from the opening tag ---
function extractAttribute(openingTag, attrName) {
  const regex = new RegExp(`\\s${attrName}="([^"]*)"`, 'i');
  const match = openingTag.match(regex);
  return match ? match[1] : '';
}

// --- Extract all aria-* attributes, sorted ---
function extractAriaAttributes(openingTag) {
  const matches = [];
  const regex = /\s(aria-[\w-]+)="([^"]*)"/gi;
  let m = regex.exec(openingTag);
  while (m !== null) {
    matches.push([m[1].toLowerCase(), m[2]]);
    m = regex.exec(openingTag);
  }
  matches.sort((a, b) => a[0].localeCompare(b[0]));
  return matches.map(([key, val]) => `${key}=${val}`).join(',');
}

// --- Extract and filter class list ---
function extractFilteredClassList(openingTag) {
  const classAttr = extractAttribute(openingTag, 'class');
  if (!classAttr) {return '';}
  return classAttr
    .trim()
    .split(/\s+/)
    .filter(cls => cls && !CSS_IN_JS_REGEX.test(cls))
    .sort()
    .join(' ');
}

// --- Extract path-only from URL (strip query string and fragment) ---
function extractPathOnly(url) {
  if (!url) {return '';}
  try {
    return url.split('?')[0].split('#')[0];
  } catch {
    return url;
  }
}

// --- Extract visual (non-positional) inline styles, sorted ---
function extractVisualStyles(openingTag) {
  const styleAttr = extractAttribute(openingTag, 'style');
  if (!styleAttr) {return '';}
  return styleAttr
    .split(';')
    .map(s => s.trim())
    .filter(s => s)
    .map(s => {
      const colonIdx = s.indexOf(':');
      if (colonIdx === -1) {return null;}
      const prop = s.slice(0, colonIdx).trim().toLowerCase();
      const val = s.slice(colonIdx + 1).trim();
      return { prop, val };
    })
    .filter(s => s && !POSITIONAL_PROPERTIES.has(s.prop))
    .sort((a, b) => a.prop.localeCompare(b.prop))
    .map(s => `${s.prop}:${s.val}`)
    .join(';');
}

// --- Extract width/height from attributes or inline style ---
function extractDimension(openingTag, dimName) {
  // First check HTML attribute
  const attrVal = extractAttribute(openingTag, dimName);
  if (attrVal) {return attrVal;}
  // Fallback to inline style
  const styleAttr = extractAttribute(openingTag, 'style');
  if (!styleAttr) {return '';}
  const regex = new RegExp(`(?:^|;)\\s*${dimName}\\s*:\\s*([^;]+)`, 'i');
  const match = styleAttr.match(regex);
  return match ? match[1].trim() : '';
}

// --- Extract textContent by stripping all HTML tags ---
function extractTextContent(outerHTML) {
  return decodeEntities(
    outerHTML
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// --- Extract direct child tags using tag-depth tracking ---
function extractDirectChildren(outerHTML) {
  const tagName = extractTagName(outerHTML);
  if (!tagName || VOID_ELEMENTS.has(tagName)) {
    return { childCount: 0, childTags: '' };
  }

  // Strip the outermost opening and closing tags
  const openTagEnd = outerHTML.indexOf('>');
  if (openTagEnd === -1) {return { childCount: 0, childTags: '' };}

  // Check for self-closing tag
  if (outerHTML[openTagEnd - 1] === '/') {
    return { childCount: 0, childTags: '' };
  }

  const closingTag = `</${tagName}>`;
  const closingIdx = outerHTML.lastIndexOf(closingTag);
  if (closingIdx === -1) {return { childCount: 0, childTags: '' };}

  const inner = outerHTML.slice(openTagEnd + 1, closingIdx);
  if (!inner.trim()) {return { childCount: 0, childTags: '' };}

  // Track depth to find direct children (depth 0 tags)
  const children = [];
  let depth = 0;
  const tagRegex = /<\/?(\w+)([^>]*?)(\/?)\s*>/g;
  let match = tagRegex.exec(inner);

  while (match !== null) {
    const isClosing = match[0][1] === '/';
    const name = match[1].toLowerCase();
    const isSelfClosing = match[3] === '/' || VOID_ELEMENTS.has(name);

    if (isClosing) {
      depth -= 1;
    } else if (depth === 0) {
      children.push(name);
      if (!isSelfClosing) {
        depth += 1;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }
    match = tagRegex.exec(inner);
  }

  return {
    childCount: children.length,
    childTags: [...new Set(children)].sort().join(',')
  };
}

// --- Main fingerprint computation ---
// [a11y-core]: html fingerprint hash for dedup/grouping
function computeFingerprintHash(outerHTML) {
  if (!outerHTML || typeof outerHTML !== 'string') {return null;}

  try {
    const openingTag = extractOpeningTag(outerHTML);
    if (!openingTag) {return null;}

    // Strip data-percy-* and data-* attributes for consistent fingerprinting
    const cleanTag = openingTag
      .replace(/\s*data-[a-zA-Z-]+="[^"]*"/g, '')
      .replace(/\s*data-[a-zA-Z-]+='[^']*'/g, '');

    const { childCount, childTags } = extractDirectChildren(outerHTML);

    // 13-field fingerprint spec
    const fields = [
      extractTagName(outerHTML),
      extractAttribute(cleanTag, 'role'),
      extractAriaAttributes(cleanTag),
      extractAttribute(cleanTag, 'type'),
      extractPathOnly(extractAttribute(cleanTag, 'href')),
      extractPathOnly(extractAttribute(cleanTag, 'src')),
      extractFilteredClassList(cleanTag),
      extractVisualStyles(cleanTag),
      extractDimension(cleanTag, 'width'),
      extractDimension(cleanTag, 'height'),
      extractTextContent(outerHTML),
      String(childCount),
      childTags
    ];

    const fingerprintString = fields.join('||');
    return fnvHash(fingerprintString);
  } catch {
    return null;
  }
}

export default computeFingerprintHash;
