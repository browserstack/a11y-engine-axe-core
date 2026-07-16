// [a11y-core]: COI denylist Type A gate — matcher tests (AXE-3735).
describe('axe.utils.isDeniedFrameOrigin', () => {
  const { isDeniedFrameOrigin } = axe.utils;
  const denylist = new Set(['doubleclick.net', 'adnxs.com']);

  it('is false when no denylist Set is provided (flag off => byte-identical)', () => {
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'https://ads.doubleclick.net/x' })
    );
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'https://ads.doubleclick.net/x' }, undefined)
    );
  });

  it('is false for an empty denylist Set', () => {
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'https://ads.doubleclick.net/x' }, new Set())
    );
  });

  it('denies an exact-origin frame', () => {
    assert.isTrue(
      isDeniedFrameOrigin({ src: 'https://doubleclick.net/tag' }, denylist)
    );
  });

  it('denies a subdomain frame (dot-boundary suffix)', () => {
    assert.isTrue(
      isDeniedFrameOrigin({ src: 'https://a.b.adnxs.com/px' }, denylist)
    );
  });

  it('does NOT deny a non-dot-boundary substring host (no false positive)', () => {
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'https://notdoubleclick.net/x' }, denylist)
    );
  });

  it('does NOT deny an unrelated origin', () => {
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'https://example.com/x' }, denylist)
    );
  });

  it('is false for non-http(s) / srcless / about:blank frames (never denied)', () => {
    assert.isFalse(isDeniedFrameOrigin({ src: '' }, denylist));
    assert.isFalse(isDeniedFrameOrigin({ src: 'about:blank' }, denylist));
    assert.isFalse(
      isDeniedFrameOrigin({ src: 'data:text/html,<b>x</b>' }, denylist)
    );
  });

  it('fails open on an unparseable src', () => {
    assert.isFalse(isDeniedFrameOrigin({ src: 'http://' }, denylist));
  });

  it('works on a real iframe element', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://ads.doubleclick.net/pagead';
    assert.isTrue(isDeniedFrameOrigin(iframe, denylist));
  });
});
