import { getViewportSize } from '../../commons/dom';

export default function getOverlayFromStack(elm, options) {
  options = options || {};
  const modalPercent = options.modalPercent || 0.75;

  const viewport = getViewportSize(window);
  const percentWidth = viewport.width * modalPercent;
  const percentHeight = viewport.height * modalPercent;

  if (elm instanceof window.Element) {
    const style = window.getComputedStyle(elm);
    const rect = elm.getBoundingClientRect();
    if (
      rect.width >= percentWidth &&
      rect.height >= percentHeight &&
      style?.getPropertyValue('pointer-events') !== 'none' &&
      (style?.position === 'absolute' || style?.position === 'fixed')
    ) {
      return true;
    }
  }
  return false;
}
