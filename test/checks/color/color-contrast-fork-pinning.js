describe('color-contrast (BrowserStack fork pinning)', () => {
  // AXE-3659 — pins fork-only behavior in lib/checks/color/color-contrast-evaluate.js
  // that has zero upstream coverage, so the 4.12.1 merge (and the deferred colorParse
  // graft) cannot silently drop it:
  //   1. reviewPayload.visualHelperData  (// a11y-rule-color-contrast) — bulk-NR payload
  //      consumed by dom-forge-core violation-helper + ip-protection jobAIColorContrast.
  //   2. whole-body try/catch + addCheckError  (// a11y-color-contrast) — AXE-2707
  //      resilience: a check-internal error must not crash the Type-A run.
  const { html, checkSetup, MockCheckContext, getCheckEvaluate } =
    axe.testUtils;
  const fixture = document.getElementById('fixture');
  const checkContext = MockCheckContext();

  afterEach(() => {
    fixture.innerHTML = '';
    checkContext.reset();
    axe._tree = undefined;
    delete window.a11yEngine;
  });

  it('emits reviewPayload.visualHelperData (fgColor/bgColor/isLargeText/textContent)', () => {
    const contrastEvaluate = getCheckEvaluate('color-contrast', {
      verifyMessage: false
    });
    const params = checkSetup(html`
      <div style="background-color: #fff; color: #111; font-size: 12pt;">
        <span id="target">Sample text content</span>
      </div>
    `);
    contrastEvaluate.apply(checkContext, params);

    const data = checkContext._data || {};
    const vhd = data.reviewPayload && data.reviewPayload.visualHelperData;
    assert.isObject(vhd, 'reviewPayload.visualHelperData must be present');
    assert.property(vhd, 'fgColor');
    assert.property(vhd, 'bgColor');
    assert.isBoolean(vhd.isLargeText);
    assert.equal(vhd.textContent, 'Sample text content');
  });

  it('truncates reviewPayload.textContent to at most 100 chars', () => {
    const contrastEvaluate = getCheckEvaluate('color-contrast', {
      verifyMessage: false
    });
    const long = new Array(60).fill('word').join(' '); // ~299 chars, word-spaced
    const params = checkSetup(
      '<div style="background-color:#fff;color:#111;font-size:12pt;">' +
        '<span id="target">' +
        long +
        '</span></div>'
    );
    contrastEvaluate.apply(checkContext, params);
    const tc = checkContext._data.reviewPayload.visualHelperData.textContent;
    assert.isAtMost(tc.length, 100);
  });

  it('catches an internal error: messageKey "Check error", addCheckError, returns undefined', () => {
    const addCheckError = sinon.spy();
    window.a11yEngine = { errorHandler: { addCheckError } };
    const params = checkSetup(
      '<div id="target" style="color:#000;background:#fff;">x</div>'
    );
    const rawEvaluate = axe._audit.checks['color-contrast'].evaluate;
    // options === undefined -> the top-of-body destructure throws INSIDE the try
    const result = rawEvaluate.call(
      checkContext,
      params[0],
      undefined,
      params[2]
    );

    assert.isUndefined(result);
    assert.equal(checkContext._data.messageKey, 'Check error');
    assert.isTrue(
      addCheckError.calledOnce,
      'addCheckError called exactly once'
    );
    assert.instanceOf(addCheckError.firstCall.args[1], Error);
  });
});
