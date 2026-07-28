describe('aria-valid-attr-value', () => {
  'use strict';

  const checkContext = axe.testUtils.MockCheckContext();
  const checkSetup = axe.testUtils.checkSetup;
  const checkEvaluate = axe.testUtils.getCheckEvaluate('aria-valid-attr-value');

  afterEach(() => {
    checkContext.reset();
  });

  it('emits the flagged aria-current attribute in reviewPayload.visualHelperData', () => {
    const params = checkSetup(
      '<div id="target" aria-current="active">Contents</div>'
    );
    assert.isUndefined(checkEvaluate.apply(checkContext, params));
    assert.equal(checkContext._data.messageKey, 'ariaCurrent');
    assert.equal(checkContext._data.needsReview, 'aria-current="active"');
    assert.deepEqual(checkContext._data.reviewPayload, {
      visualHelperData: { ariaAttribute: 'aria-current="active"' }
    });
  });

  it('emits the flagged aria-labelledby attribute in reviewPayload.visualHelperData', () => {
    const params = checkSetup(
      '<div id="target" aria-labelledby="missing-id">Contents</div>'
    );
    assert.isUndefined(checkEvaluate.apply(checkContext, params));
    assert.equal(
      checkContext._data.needsReview,
      'aria-labelledby="missing-id"'
    );
    assert.deepEqual(checkContext._data.reviewPayload, {
      visualHelperData: { ariaAttribute: 'aria-labelledby="missing-id"' }
    });
  });

  it('does not add a reviewPayload on the invalid-value (violation) path', () => {
    const params = checkSetup(
      '<div id="target" role="checkbox" aria-checked="foo">Contents</div>'
    );
    assert.isFalse(checkEvaluate.apply(checkContext, params));
    assert.isArray(checkContext._data);
    assert.notProperty(checkContext._data, 'reviewPayload');
  });
});
