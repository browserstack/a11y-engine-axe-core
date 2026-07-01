describe('axe.utils.getAncestry (BrowserStack fork pinning)', () => {
  // AXE-3659 — pins the fork-only // a11y-critical behavior in
  // lib/core/utils/get-ancestry.js: when computing :nth-child for a DIRECT child of
  // <body>, Percy-injected siblings (data-percy-injected) are ignored, so ancestry
  // indexes match the un-instrumented page. Zero upstream coverage.
  //
  // Method: measure a body child's ancestry, then insert a data-percy-injected sibling
  // immediately before it and re-measure. The fork skips the percy node, so the index
  // must be UNCHANGED. (Without the skip, the index would increment by one.)
  const getAncestry = axe.utils.getAncestry;

  const removeForkPins = () => {
    Array.prototype.slice
      .call(document.body.querySelectorAll('[data-fork-pin]'))
      .forEach(el => el.remove());
  };

  afterEach(() => {
    axe.teardown();
    removeForkPins();
  });

  it('data-percy-injected body siblings do not shift a body child :nth-child', () => {
    removeForkPins();
    const sib = document.createElement('div');
    sib.setAttribute('data-fork-pin', '');
    const target = document.createElement('div');
    target.id = 'fork-pin-target';
    target.setAttribute('data-fork-pin', '');
    document.body.appendChild(sib);
    document.body.appendChild(target);

    axe.setup(document.documentElement);
    const before = getAncestry(target);
    axe.teardown(); // clears the ancestry/selector cache between measurements

    const percy = document.createElement('div');
    percy.setAttribute('data-percy-injected', 'true');
    percy.setAttribute('data-fork-pin', '');
    document.body.insertBefore(percy, target); // directly before target

    axe.setup(document.documentElement);
    const after = getAncestry(target);
    axe.teardown();

    removeForkPins();
    assert.include(
      String(before),
      ':nth-child',
      'sanity: a body child ancestry uses :nth-child'
    );
    assert.deepEqual(
      after,
      before,
      'a Percy-injected sibling must be ignored when indexing :nth-child'
    );
  });
});
