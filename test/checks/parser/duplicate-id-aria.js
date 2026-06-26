describe('duplicate-id-aria', function () {
  'use strict';

  var fixture = document.getElementById('fixture');
  var fixtureSetup = axe.testUtils.fixtureSetup;
  var checkContext = axe.testUtils.MockCheckContext();
  var checkEvaluate = axe.testUtils.getCheckEvaluate('duplicate-id-aria');

  afterEach(function () {
    fixture.innerHTML = '';
    axe._tree = undefined;
    checkContext.reset();
  });

  it('returns true and emits no reviewPayload when the id is unique', function () {
    fixtureSetup('<div id="solo"></div>');
    var node = fixture.querySelector('#solo');
    assert.isTrue(checkEvaluate.call(checkContext, node));
    assert.equal(checkContext._data.id, 'solo');
    assert.notProperty(checkContext._data, 'reviewPayload');
    assert.deepEqual(checkContext._relatedNodes, []);
  });

  it('emits the duplicate id and element selectors in reviewPayload.visualHelperData', function () {
    fixtureSetup(
      '<div id="dup"></div><div id="dup"></div><div id="dup"></div>'
    );
    var node = fixture.querySelector('div');
    assert.isFalse(checkEvaluate.call(checkContext, node));

    assert.equal(checkContext._data.id, 'dup');
    var visualHelperData = checkContext._data.reviewPayload.visualHelperData;
    assert.equal(visualHelperData.duplicateId, 'dup');
    // the OTHER elements sharing the id (relatedNodes), each a
    // DqElement.selector array identical to relatedNodes[].selector
    assert.lengthOf(visualHelperData.elements, 2);
    assert.isArray(visualHelperData.elements[0]);
    assert.isString(visualHelperData.elements[0][0]);
  });

  it('after dedupes results by data.id', function () {
    var results = checks['duplicate-id-aria'].after([
      { data: { id: 'a' } },
      { data: { id: 'b' } },
      { data: { id: 'b' } }
    ]);
    assert.lengthOf(results, 2);
    assert.deepEqual(
      results.map(function (r) {
        return r.data.id;
      }),
      ['a', 'b']
    );
  });
});
