import { createFrameContext } from './create-frame-context';
import {
  getNodeFromTree,
  isDeniedFrameOrigin,
  shadowSelectAll
} from '../../utils';

/**
 * Finds frames in context, converts selectors to Element references and pushes unique frames
 * @private
 * @param  {Context} context The instance of Context to operate on
 * @param  {String} type     The "type" of thing to parse, "include" or "exclude"
 * @return {Array}           Parsed array of matching elements
 */
export function parseSelectorArray(context, type) {
  const result = [];
  for (let i = 0, l = context[type].length; i < l; i++) {
    const item = context[type][i];
    // Handle nodes
    if (item instanceof window.Node) {
      if (item.documentElement instanceof window.Node) {
        result.push(context.flatTree[0]);
      } else {
        result.push(getNodeFromTree(item));
      }

      // Handle Iframe selection
    } else if (item && item.length) {
      if (item.length > 1) {
        pushUniqueFrameSelector(context, type, item);
      } else {
        const nodeList = shadowSelectAll(item[0]);
        result.push(...nodeList.map(node => getNodeFromTree(node)));
      }
    }
  }

  // filter nulls
  return result.filter(r => r);
}

/**
 * Unshift selectors of matching iframes
 * @private
 * @param  {Context} context 	  The context object to operate on and assign to
 * @param  {String} type          The "type" of context, 'include' or 'exclude'
 * @param  {Array} selectorArray  Array of CSS selectors, each element represents a frame;
 * where the last element is the actual node
 */
function pushUniqueFrameSelector(context, type, selectorArray) {
  context.frames = context.frames || [];

  const frameSelector = selectorArray.shift();
  const frames = shadowSelectAll(frameSelector);
  // [a11y-critical]: read the COI ad denylist once for this selector group.
  // Undefined unless a11y-engine-core armed Type A cross-origin and injected it
  // via axe.configure — off => enumeration is byte-identical to main.
  const crossOriginDenylist = axe._audit && axe._audit.crossOriginDenylist;
  frames.forEach(frame => {
    // Skip ad iframes on the denylist BEFORE they enter context.frames, so they
    // are never enumerated or traversed by either the sync or async frame path
    // (this is the single frame-enumeration chokepoint). The iframe element and
    // its readable src are still in hand here — the postMessage layer one level
    // down cannot gate on origin.
    //
    // BY DESIGN (spec §5 table + §5.1): Type A drops the denied frame here with a
    // bare `return`, so it never enters context.frames and produces NO
    // not-evaluated marker. This is intentionally asymmetric with Type B1/C
    // (a11y-engine-core), which route denied frames through markFrameNotEvaluated
    // to preserve the "checked-clean vs could-not-check" distinction. In Type A the
    // frame is removed at enumeration — before any node/result exists to annotate —
    // so there is nothing to mark; adding a marker would mean re-introducing the
    // very frame the denylist exists to drop.
    if (isDeniedFrameOrigin(frame, crossOriginDenylist)) {
      return;
    }
    let frameContext = context.frames.find(result => result.node === frame);
    if (!frameContext) {
      frameContext = createFrameContext(frame, context);
      context.frames.push(frameContext);
    }
    frameContext[type].push(selectorArray);
  });
}
