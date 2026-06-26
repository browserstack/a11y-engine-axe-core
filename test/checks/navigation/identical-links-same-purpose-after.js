describe('identical-links-same-purpose-after tests', function () {
  'use strict';

  var fixture = document.getElementById('fixture');
  var check = checks['identical-links-same-purpose'];

  afterEach(function () {
    fixture.innerHTML = '';
  });

  it('returns results by clearing relatedNodes after ignoring nodes which has no data (or result is undefined)', function () {
    var nodeOneData = {
      data: null,
      relatedNodes: ['nodeOne'],
      result: undefined
    };
    var nodeTwoData = {
      data: {
        name: 'read more',
        urlProps: { hostname: 'abc.com' }
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];

    var results = check.after(checkResults);
    assert.lengthOf(results, 1);

    var result = results[0];
    assert.deepEqual(result.data, nodeTwoData.data);
    assert.deepEqual(result.relatedNodes, []);
    assert.equal(result.result, true);
  });

  it('sets results of check result to `undefined` one of the native links do not have `urlProps` (and therefore removed as relatedNode)', function () {
    var nodeOneData = {
      data: {
        name: 'read more',
        urlProps: undefined
      },
      relatedNodes: ['nodeOne'],
      result: true
    };
    var nodeTwoData = {
      data: {
        name: 'read more',
        urlProps: { hostname: 'abc.com' }
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];

    var results = check.after(checkResults);
    assert.lengthOf(results, 1);

    var result = results[0];
    assert.deepEqual(result.data, nodeOneData.data);
    assert.deepEqual(result.relatedNodes, ['nodeTwo']);
    assert.equal(result.result, undefined);
  });

  it('sets results of check result to `undefined` if native links do not have same `urlProps` (values are different)', function () {
    var nodeOneData = {
      data: {
        name: 'follow us',
        urlProps: { hostname: 'facebook.com' }
      },
      relatedNodes: ['nodeOne'],
      result: true
    };
    var nodeTwoData = {
      data: {
        name: 'follow us',
        urlProps: { hostname: 'instagram.com' }
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];

    var results = check.after(checkResults);
    assert.lengthOf(results, 1);

    var result = results[0];
    assert.deepEqual(result.data, nodeOneData.data);
    assert.deepEqual(result.relatedNodes, ['nodeTwo']);
    assert.equal(result.result, undefined);
  });

  it('sets results of check result to `undefined` if native links do not have same `urlProps` (keys are different)', function () {
    var nodeOneData = {
      data: {
        name: 'follow us',
        urlProps: { abc: 'abc.com' }
      },
      relatedNodes: ['nodeOne'],
      result: true
    };
    var nodeTwoData = {
      data: {
        name: 'follow us',
        urlProps: { xyz: 'abc.com' }
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];

    var results = check.after(checkResults);
    assert.lengthOf(results, 1);

    var result = results[0];
    assert.deepEqual(result.data, nodeOneData.data);
    assert.deepEqual(result.relatedNodes, ['nodeTwo']);
    assert.equal(result.result, undefined);
  });

  it('sets results of check result to `true` if native links serve identical purpose', function () {
    var nodeOneData = {
      data: {
        name: 'Axe Core',
        urlProps: { hostname: 'deque.com', pathname: 'axe-core' }
      },
      relatedNodes: ['nodeOne'],
      result: true
    };
    var nodeTwoData = {
      data: {
        name: 'Axe Core',
        urlProps: { hostname: 'deque.com', pathname: 'axe-core' }
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];

    var results = check.after(checkResults);

    assert.lengthOf(results, 1);

    var result = results[0];
    assert.deepEqual(result.data, nodeOneData.data);
    assert.deepEqual(result.relatedNodes, ['nodeTwo']);
    assert.equal(result.result, true);
  });

  it('sets results of check result to `true` if ARIA links have different accessible names', function () {
    var nodeOneData = {
      data: {
        name: 'earth',
        urlProps: {}
      },
      relatedNodes: ['nodeOne'],
      result: true
    };

    var nodeTwoData = {
      data: {
        name: 'venus',
        urlProps: {}
      },
      relatedNodes: ['nodeTwo'],
      result: true
    };
    var checkResults = [nodeOneData, nodeTwoData];
    var results = check.after(checkResults);
    assert.lengthOf(results, 2);

    assert.deepEqual(results[0].data, nodeOneData.data);
    assert.deepEqual(results[0].relatedNodes, []);
    assert.equal(results[0].result, true);

    assert.deepEqual(results[1].data, nodeTwoData.data);
    assert.deepEqual(results[1].relatedNodes, []);
    assert.equal(results[1].result, true);
  });

  it('emits the link group selectors in reviewPayload.visualHelperData for identical links', function () {
    var nodeOneData = {
      data: {
        name: 'read more',
        accessibleText: 'Read More',
        urlProps: { pathname: '/blog/ai-health' }
      },
      relatedNodes: [{ selector: ['#card-1 > a.read-more'] }],
      result: true
    };
    var nodeTwoData = {
      data: {
        name: 'read more',
        accessibleText: 'Read More',
        urlProps: { pathname: '/blog/ai-finance' }
      },
      relatedNodes: [{ selector: ['#card-2 > a.read-more'] }],
      result: true
    };

    var results = check.after([nodeOneData, nodeTwoData]);
    assert.lengthOf(results, 1);

    // full group: the primary link plus every same-name sibling, each entry a
    // DqElement.selector array identical to relatedNodes[].selector
    var visualHelperData = results[0].data.reviewPayload.visualHelperData;
    assert.deepEqual(visualHelperData.identicalLinks, [
      ['#card-1 > a.read-more'],
      ['#card-2 > a.read-more']
    ]);
    // the actual rendered link text shared by the group (original case)
    assert.equal(visualHelperData.linkText, 'Read More');
  });

  it('does not emit reviewPayload when a link has no same-name group', function () {
    var nodeOneData = {
      data: { name: 'earth', urlProps: {} },
      relatedNodes: [{ selector: ['#a'] }],
      result: true
    };
    var nodeTwoData = {
      data: { name: 'venus', urlProps: {} },
      relatedNodes: [{ selector: ['#b'] }],
      result: true
    };

    var results = check.after([nodeOneData, nodeTwoData]);
    assert.lengthOf(results, 2);
    assert.notProperty(results[0].data, 'reviewPayload');
    assert.notProperty(results[1].data, 'reviewPayload');
  });
});
