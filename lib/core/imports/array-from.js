/**
 * Minimal Array.from (iterables, array-likes, mapFn).
 * Used instead of core-js-pure/actual/array/from, which bundles an IE-only
 * Object.create fallback that the Chrome Web Store flags as obfuscated code.
 * Avoids for...of on purpose: the transpiled helper calls Array.from itself.
 */
export default function arrayFrom(items, mapFn, thisArg) {
  if (items === null || items === undefined) {
    throw new TypeError('Array.from requires an array-like or iterable object');
  }
  if (mapFn !== undefined && typeof mapFn !== 'function') {
    throw new TypeError(
      'Array.from: when provided, the second argument must be a function'
    );
  }

  const result = [];
  let index = 0;
  const iteratorFn =
    typeof Symbol === 'function' ? items[Symbol.iterator] : undefined;

  if (typeof iteratorFn === 'function') {
    const iterator = iteratorFn.call(items);
    let step = iterator.next();
    while (!step.done) {
      result.push(mapFn ? mapFn.call(thisArg, step.value, index) : step.value);
      index++;
      step = iterator.next();
    }
    return result;
  }

  const arrayLike = Object(items);
  const length = Math.max(0, Math.floor(Number(arrayLike.length)) || 0);
  for (; index < length; index++) {
    const value = arrayLike[index];
    result.push(mapFn ? mapFn.call(thisArg, value, index) : value);
  }
  return result;
}
