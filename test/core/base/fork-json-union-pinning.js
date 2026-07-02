describe('rule JSON unions (BrowserStack fork <- upstream 4.12.1)', () => {
  // AXE-3659 — asserts the T3 config-union OUTCOMES are present in the compiled audit:
  // upstream metadata changes (new sub-check wiring, page-level selector fix, RGAA
  // reclassification) are applied. Fork-only fields (needsReviewConfidence, display
  // tags) are preserved by construction and verified via git diff. Guards the
  // AXE-2707 silent-loss class from the merge acceptance gate (AXE3659-21).
  const getRule = id => axe._audit.rules.find(rule => rule.id === id);

  it('aria-allowed-attr wires the net-new upstream sub-check aria-allowed-attr-elm', () => {
    const rule = getRule('aria-allowed-attr');
    assert.ok(rule, 'aria-allowed-attr rule present in audit');
    assert.include(JSON.stringify(rule.all), 'aria-allowed-attr-elm');
  });

  it('page-level rules adopt the upstream html:not(html *) selector', () => {
    assert.ok(getRule('bypass'), 'bypass rule present');
    assert.equal(getRule('bypass').selector, 'html:not(html *)');
    assert.ok(
      getRule('css-orientation-lock'),
      'css-orientation-lock rule present'
    );
    assert.equal(getRule('css-orientation-lock').selector, 'html:not(html *)');
    assert.ok(getRule('frame-tested'), 'frame-tested rule present');
    assert.equal(
      getRule('frame-tested').selector,
      'html:not(html *), frame, iframe'
    );
  });

  it('aria-hidden-focus adopts the upstream RGAA-10.8.1 reclassification', () => {
    const rule = getRule('aria-hidden-focus');
    assert.ok(rule, 'aria-hidden-focus rule present');
    assert.include(rule.tags, 'RGAA-10.8.1');
  });
});
