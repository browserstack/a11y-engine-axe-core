describe('label-content-name-mismatch (BrowserStack fork pinning)', () => {
  // AXE-3659 — pins the fork's reimplementation in
  // lib/checks/label/label-content-name-mismatch-evaluate.js (all // a11y-rule-* tagged).
  // The 4.12.1 merge DECLINES upstream's subtreeText->visibleVirtual switch (Tier-1 #1)
  // because that switch would drop the fork's ignoreNativeTextAlternative flag and its
  // NLP. These tests fail if upstream's simpler literal-includes logic were adopted:
  //   1. wink-porter2 stemming (inflected visible text still matches the name)
  //   2. whitespace/case-insensitive matching (curateString strips whitespace)
  //   3. reviewPayload.visualHelperData.accessibleName on a genuine mismatch
  // The subtreeText({ ignoreNativeTextAlternative: true }) call is the fork evaluate
  // path these cases exercise end-to-end.
  const { checkSetup, MockCheckContext, getCheckEvaluate } = axe.testUtils;
  const fixture = document.getElementById('fixture');
  const checkContext = MockCheckContext();
  const evaluate = getCheckEvaluate('label-content-name-mismatch', {
    verifyMessage: false
  });

  afterEach(() => {
    fixture.innerHTML = '';
    checkContext.reset();
    axe._tree = undefined;
  });

  it('passes when visible text is an inflected (stemmed) form of the accessible name', () => {
    // "saving change" stems to "save chang", matching "save changes"; upstream's
    // literal includes-check would report a mismatch here.
    const params = checkSetup(
      '<button id="target" aria-label="save changes">Saving change</button>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('matches ignoring whitespace and case (fork curateString strips whitespace)', () => {
    // "Log In" (name) vs "login" (content) match only because the fork strips
    // whitespace before comparing; upstream's whitespace-sensitive compare would not.
    const params = checkSetup(
      '<button id="target" aria-label="Log In">login</button>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('reports a genuine mismatch and emits reviewPayload.visualHelperData.accessibleName', () => {
    const params = checkSetup(
      '<button id="target" aria-label="Cancel">Submit</button>'
    );
    const result = evaluate.apply(checkContext, params);
    assert.isFalse(result, 'unrelated visible text vs name is a mismatch');
    const vhd =
      checkContext._data &&
      checkContext._data.reviewPayload &&
      checkContext._data.reviewPayload.visualHelperData;
    assert.isObject(
      vhd,
      'reviewPayload.visualHelperData must be present on mismatch'
    );
    assert.equal(vhd.accessibleName, 'cancel');
  });
});
