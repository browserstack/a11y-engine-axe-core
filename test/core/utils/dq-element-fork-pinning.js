describe('DqElement (BrowserStack fork pinning)', () => {
  // AXE-3659 — pins fork-only behavior in lib/core/utils/dq-element.js (all // a11y-*
  // tagged) with zero upstream coverage:
  //   1. htmlHash fingerprint on toJSON()            (// [a11y-core])
  //   2. data-percy-* attribute stripping in source   (// a11y-critical)
  //   3. targetFormat==='ancestry' selector branch    (// a11y-critical, axe._cache)
  //   4. runTypeAOpt source branch via getSourceOpt    (// a11y-critical, axe._cache)
  // These consumer-critical fields (htmlHash, source, ancestry selector) are asserted
  // in the Tech Spec §Consumer dependencies as load-bearing for ip-protection/dom-forge.
  const DqElement = axe.utils.DqElement;
  const { fixtureSetup, queryFixture } = axe.testUtils;
  const fixture = document.getElementById('fixture');

  afterEach(() => {
    axe._cache.set('runTypeAOpt', undefined);
    axe._cache.set('targetFormat', undefined);
    axe.reset();
  });

  it('toJSON() includes an htmlHash that fingerprints the element outerHTML', () => {
    fixtureSetup(
      '<div class="a">X</div><div class="a">X</div><div class="a">Y</div>'
    );
    const h0 = new DqElement(fixture.children[0]).toJSON().htmlHash;
    const h1 = new DqElement(fixture.children[1]).toJSON().htmlHash;
    const h2 = new DqElement(fixture.children[2]).toJSON().htmlHash;
    assert.isString(h0);
    assert.isNotEmpty(h0);
    assert.equal(h0, h1, 'identical outerHTML -> identical htmlHash');
    assert.notEqual(h0, h2, 'different outerHTML -> different htmlHash');
  });

  it('strips data-percy-* attributes from source, keeps real attributes', () => {
    const vNode = queryFixture(
      '<div id="target" data-percy-injected="true" class="keep">Hi</div>'
    );
    const source = new DqElement(vNode).source;
    assert.notInclude(source, 'data-percy');
    assert.include(source, 'class="keep"');
  });

  it('targetFormat==="ancestry" -> selector is [getAncestry(element)]', () => {
    const vNode = queryFixture('<div id="target">Hi</div>');
    // set AFTER setup so fixtureSetup/axe.setup cannot clear it before construction
    axe._cache.set('targetFormat', 'ancestry');
    const dq = new DqElement(vNode);
    assert.deepEqual(dq.selector, [axe.utils.getAncestry(vNode.actualNode)]);
  });

  it('runTypeAOpt -> source generated via getSourceOpt (open tag only for parents)', () => {
    const vNode = queryFixture('<div id="target"><span>child</span></div>');
    axe._cache.set('runTypeAOpt', true);
    const dq = new DqElement(vNode);
    // getSourceOpt: element has children -> emits the open tag with attributes only
    assert.equal(dq.source, '<div id="target">');
  });
});
