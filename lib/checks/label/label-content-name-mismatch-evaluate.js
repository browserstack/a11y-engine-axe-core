import {
  accessibleText,
  isHumanInterpretable,
  subtreeText,
  sanitize,
  removeUnicode
} from '../../commons/text';
const stem = require('wink-porter2-stemmer');

/**
 * Check if a given text exists in another
 *
 * @param {String} compare given text to check
 * @param {String} compareWith text against which to be compared
 * @returns {Boolean}
 */

function cleanText(str) {
  return str
    ?.toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim();
}

function replaceSynonyms(text) {
  const synonymMap = {
    '&': 'and'
  };
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map(word => synonymMap[word] || word)
    .join(' ');
}

function stringStemmer(str) {
  return replaceSynonyms(str)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(word => {
      const w = cleanText(word).replace(/[^\p{L}\p{N}]/gu, '');
      try {
        return stem(w);
      } catch (err) {
        console.warn('Stemming failed for', w, err);
        return w;
      }
    })
    .join(' ');
}

function isStringContained(compare, compareWith) {
  compare = stringStemmer(compare);
  compareWith = stringStemmer(compareWith);

  const curatedCompareWith = curateString(compareWith);
  const curatedCompare = curateString(compare);
  if (!curatedCompareWith || !curatedCompare) {
    return false;
  }
  const res = curatedCompareWith.includes(curatedCompare);
  if (res) {
    return res;
  }

  const tokensA = compare.split(/[^\p{L}\p{N}]+/u);
  const tokensB = compareWith.split(/[^\p{L}\p{N}]+/u);
  const freqA = {},
    freqB = {};
  tokensA.forEach(word => {
    freqA[word] = (freqA[word] || 0) + 1;
  });
  tokensB.forEach(word => {
    freqB[word] = (freqB[word] || 0) + 1;
  });

  let dot = 0,
    magA = 0,
    magB = 0;
  const allTerms = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  allTerms.forEach(term => {
    const a = freqA[term] || 0;
    const b = freqB[term] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  });

  const similarity =
    magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
  return similarity >= 0.75; // comparision with threshold as 75%
}

/**
 * Curate given text, by removing emoji's, punctuations, unicode and trim whitespace.
 *
 * @param {String} str given text to curate
 * @returns {String}
 */
function curateString(str) {
  const noUnicodeStr = removeUnicode(str, {
    emoji: true,
    nonBmp: true,
    punctuations: true,
    whitespace: true
  });
  return sanitize(noUnicodeStr);
}

function labelContentNameMismatchEvaluate(node, options, virtualNode) {
  const pixelThreshold = options?.pixelThreshold;
  const occurrenceThreshold =
    options?.occurrenceThreshold ?? options?.occuranceThreshold;

  const accText = accessibleText(node).toLowerCase();
  if (isHumanInterpretable(accText) < 1) {
    return undefined;
  }

  const visibleText = sanitize(
    subtreeText(virtualNode, {
      subtreeDescendant: true,
      ignoreIconLigature: true,
      pixelThreshold,
      occurrenceThreshold,
      ignoreNativeTextAlternative: true // To Skip for nativeTextAlternative
    })
  ).toLowerCase();

  if (!visibleText) {
    return true;
  }
  if (isHumanInterpretable(visibleText) < 1) {
    if (isStringContained(visibleText, accText)) {
      return true;
    }
    return undefined;
  }

  return isStringContained(visibleText, accText);
}

export default labelContentNameMismatchEvaluate;
