import getSelector from './get-selector';
import respondable from './respondable';
import log from '../log';

// a11y-critical : How often a pending 'axe.start' checks that its frame is still in the page
const frameConnectedCheckInterval = 500;

/**
 * Sends a command to an instance of axe in the specified frame
 * @param  {Element}  node       The frame element to send the message to
 * @param  {Object}   parameters Parameters to pass to the frame
 * @param  {Function} callback   Function to call when results from the frame has returned
 */
export default function sendCommandToFrame(node, parameters, resolve, reject) {
  const win = node.contentWindow;
  const pingWaitTime = parameters.options?.pingWaitTime ?? 500;
  if (!win) {
    log('Frame does not have a content window', node);
    resolve(null);
    return;
  }

  // Skip ping
  if (pingWaitTime === 0) {
    callAxeStart(node, parameters, resolve, reject);
    return;
  }

  // give the frame .5s to respond to 'axe.ping', else log failed response
  let timeout = setTimeout(() => {
    // This double timeout is important for allowing iframes to respond
    // DO NOT REMOVE
    timeout = setTimeout(() => {
      if (!parameters.debug) {
        resolve(null);
      } else {
        reject(err('No response from frame', node));
      }
    }, 0);
  }, pingWaitTime);

  // send 'axe.ping' to the frame
  respondable(win, 'axe.ping', null, undefined, () => {
    clearTimeout(timeout);
    callAxeStart(node, parameters, resolve, reject);
  });
}

function callAxeStart(node, parameters, resolve, reject) {
  // a11y-critical : Give axe 60s (or frameWaitTime) to respond to 'axe.start'. A frame that
  // doesn't, or whose document is replaced or which is removed first, is skipped
  // (resolved with null); with debug set it rejects instead.
  const frameWaitTime = parameters.options?.frameWaitTime ?? 60000;
  const win = node.contentWindow;
  // 'axe.start' goes to this document; null when it cannot be read (cross-origin)
  const frameDocument = getFrameDocument(node);
  let settled = false;

  const timeout = setTimeout(function collectResultFramesTimeout() {
    skipFrame('Axe in frame timed out');
  }, frameWaitTime);
  node.addEventListener('load', onFrameLoad);
  const connectedCheck = setInterval(() => {
    if (!node.isConnected) {
      skipFrame('Frame was removed');
    }
  }, frameConnectedCheckInterval);

  function settle(callback, value) {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    clearInterval(connectedCheck);
    node.removeEventListener('load', onFrameLoad);
    callback(value);
  }

  function skipFrame(message) {
    if (!parameters.debug) {
      settle(resolve, null);
    } else {
      settle(reject, err(message, node));
    }
  }

  // A different document loading in the frame will not answer 'axe.start'
  function onFrameLoad() {
    if (frameDocument && getFrameDocument(node) !== frameDocument) {
      skipFrame('Frame document was replaced');
    }
  }

  // send 'axe.start' and send the callback if it responded
  respondable(win, 'axe.start', parameters, undefined, data => {
    if (data instanceof Error === false) {
      settle(resolve, data);
    } else {
      settle(reject, data);
    }
  });
}

// a11y-critical : The frame's document, or null when it cannot be read (cross-origin)
function getFrameDocument(node) {
  try {
    return node.contentDocument;
  } catch {
    return null;
  }
}

function err(message, node) {
  let selector;
  // TODO: es-modules_tree
  if (axe._tree) {
    selector = getSelector(node);
  }
  return new Error(message + ': ' + (selector || node));
}
