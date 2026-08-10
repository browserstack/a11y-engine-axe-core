import cache from '../base/cache';
import { resetGlobals } from './run/globals-setup';

/**
 * Clean up axe-core tree and caches. `axe.run` will call this function at the end of the run so there's no need to call it yourself afterwards.
 */
function teardown() {
  // [a11y-core]: debug logging for teardown race investigation
  if (axe._running) {
    (Function("return this")()).console.warn('[DEBUG-ISSUE] axe.teardown() WHILE RUN IN FLIGHT', {
      t: Math.round(performance.now()),
      inFrame: window.top !== window
    }, new Error().stack);
  } else {
    (Function("return this")()).console.debug('[DEBUG-ISSUE] axe.teardown()', {
      t: Math.round(performance.now()),
      running: axe._running,
      inFrame: window.top !== window
    });
  }
  // Reset MUST to happen before the cache is cleared
  resetGlobals();
  axe._memoizedFns.forEach(fn => fn.clear());
  cache.clear();
  axe._tree = undefined;
  axe._selectorData = undefined;
  axe._selectCache = undefined;
}

export default teardown;
