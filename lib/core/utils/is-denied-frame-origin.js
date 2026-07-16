// [a11y-core]: Cross-Origin Iframe ad denylist (COI denylist) — Type A gate.
//
// a11y-engine-core builds the ad-hostname Set from its bundled config/coi-denylist.txt
// and hands it to the fork via axe.configure({ crossOriginDenylist }) ->
// audit.setCrossOriginDenylist (mirroring allowedOrigins). This fork is a separate
// submodule and CANNOT import a11y-engine-core, so it carries its own copy of the
// tiny suffix matcher here. When the Type A cross-origin flag is off, the Set is
// never set and this returns false, keeping frame enumeration byte-identical to main.
//
// KEEP IN SYNC: the §1 suffix-match rule below is intentionally duplicated from
// a11y-engine-core/lib/commons/coi-denylist.js (isDeniedHostname) because this fork
// cannot import that package. Any change to the match semantics MUST be mirrored
// there (and its test vectors), and vice versa. The two deliberately differ only in
// input handling: this fork takes an iframe element and resolves/validates its src
// (http(s)-only, relative→location.href); the core helper takes a pre-resolved
// origin/URL string.

/**
 * True when a frame element's src origin hostname is on the ad denylist
 * (suffix rule: host === entry OR host.endsWith('.' + entry)). Scheme and port
 * are stripped before compare. srcless / srcdoc / relative / about:blank frames
 * resolve to a same-origin or opaque host that is never on the ad list, so they
 * are never denied. Any parse error fails open (not denied).
 *
 * @param {Element} frame the iframe element (its src is readable even cross-origin)
 * @param {Set<string>} denylistSet ad-hostname Set, or undefined when the flag is off
 * @returns {boolean}
 */
export default function isDeniedFrameOrigin(frame, denylistSet) {
  if (
    !denylistSet ||
    typeof denylistSet.has !== 'function' ||
    denylistSet.size === 0
  ) {
    return false;
  }
  let host;
  try {
    const url = new URL(frame.src, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) {
    return false;
  }
  if (denylistSet.has(host)) {
    return true;
  }
  // Walk parent suffixes: a.b.doubleclick.net -> b.doubleclick.net -> doubleclick.net
  let idx = host.indexOf('.');
  while (idx !== -1) {
    if (denylistSet.has(host.slice(idx + 1))) {
      return true;
    }
    idx = host.indexOf('.', idx + 1);
  }
  return false;
}
