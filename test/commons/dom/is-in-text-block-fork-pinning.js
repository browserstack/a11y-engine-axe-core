describe('dom.isInTextBlock (BrowserStack fork pinning)', () => {
  // AXE-3659 — pins the fork-only // a11y-critical STYLE-skip in
  // lib/commons/dom/is-in-text-block.js: walkDomNode must not descend into <style>
  // elements, so CSS text inside a <style> is NOT counted as surrounding text.
  // Zero upstream coverage. In task 4 this skip must be re-applied into upstream's
  // relocated walkDomNode, so this test guards the behavior across that refactor.
  const { html, fixtureSetup } = axe.testUtils;
  const isInTextBlock = axe.commons.dom.isInTextBlock;
  const fixture = document.getElementById('fixture');

  afterEach(() => {
    fixture.innerHTML = '';
    axe.teardown();
    axe._tree = undefined;
  });

  it('does not count CSS text inside a <style> element as surrounding text', () => {
    fixtureSetup(html`
      <div id="block">
        <style>
          #block a {
            color: red;
            background: blue;
            padding: 20px;
            margin: 10px;
          }
        </style>
        <a href="#" id="target">link</a>
      </div>
    `);
    const link = document.getElementById('target');
    // Only content besides the link is the <style>; with the STYLE-skip its CSS
    // text is excluded, leaving no surrounding text.
    assert.isFalse(
      isInTextBlock(link, { noLengthCompare: true }),
      'CSS text inside <style> must not register as surrounding text'
    );
  });

  it('still detects genuine surrounding text alongside a <style> element', () => {
    fixtureSetup(html`
      <div id="block2">
        <style>
          #block2 a {
            color: red;
          }
        </style>
        Some real visible paragraph text here
        <a href="#" id="target">link</a>
      </div>
    `);
    const link = document.getElementById('target');
    assert.isTrue(
      isInTextBlock(link, { noLengthCompare: true }),
      'genuine surrounding text is still counted (skip is not over-broad)'
    );
  });
});
