// Fallback stub used when axe-core builds outside the a11y-engine monorepo.
// The real fingerprint logic lives in ip-protection/utils/fingerprint.js
// and is resolved by the esbuild plugin during monorepo builds.
// eslint-disable-next-line no-unused-vars
export function computeFingerprintHash(_outerHTML) {
  return null;
}
