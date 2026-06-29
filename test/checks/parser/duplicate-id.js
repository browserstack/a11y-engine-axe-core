describe('duplicate-id', function () {
  'use strict';

  var fixture = document.getElementById('fixture');
  var shadowSupport = axe.testUtils.shadowSupport;

  var checkContext = axe.testUtils.MockCheckContext();

  afterEach(function () {
    fixture.innerHTML = '';
    checkContext.reset();
  });

  it('should return true if there is only one element with an ID', function () {
    fixture.innerHTML = '<div id="target"></div>';
    var node = fixture.querySelector('#target');
    assert.isTrue(
      axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
    );
    assert.equal(checkContext._data, node.id);
    assert.deepEqual(checkContext._relatedNodes, []);
  });

  it('should return false if there are multiple elements with an ID', function () {
    fixture.innerHTML = '<div id="target"></div><div id="target"></div>';
    var node = fixture.querySelector('#target');
    assert.isFalse(
      axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
    );
    assert.equal(checkContext._data, node.id);
    assert.deepEqual(checkContext._relatedNodes, [node.nextSibling]);
  });

  it('keeps data a plain id string and emits no reviewPayload when the reviewPayload option is off', function () {
    // Guards the static/active duplicate-id checks: they share this evaluate
    // but never pass the reviewPayload option, so they must keep string data.
    fixture.innerHTML = '<div id="target"></div><div id="target"></div>';
    var node = fixture.querySelector('#target');
    assert.isFalse(
      axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
    );
    assert.isString(checkContext._data);
    assert.equal(checkContext._data, 'target');
    assert.isUndefined(checkContext._data.reviewPayload);
  });

  it('should return remove duplicates', function () {
    assert.deepEqual(
      checks['duplicate-id'].after([
        { data: 'a' },
        { data: 'b' },
        { data: 'b' }
      ]),
      [{ data: 'a' }, { data: 'b' }]
    );
  });

  it('removes duplicates for object-shaped data (shared after with the aria variant)', function () {
    // The shared after dedupes by data.id when data is an object
    // ({ id, reviewPayload }), as emitted by the aria (bulk-review) variant.
    assert.deepEqual(
      checks['duplicate-id'].after([
        { data: { id: 'a' } },
        { data: { id: 'b' } },
        { data: { id: 'b' } }
      ]),
      [{ data: { id: 'a' } }, { data: { id: 'b' } }]
    );
  });

  it('should ignore empty ids', function () {
    fixture.innerHTML =
      '<div data-testelm="1" id=""></div><div data-testelm="2"  id=""></div>';
    var node = fixture.querySelector('[data-testelm="1"]');

    assert.isTrue(
      axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
    );
  });

  it('should allow overwrote ids', function () {
    fixture.innerHTML =
      '<form data-testelm="1" id="target"><label>mylabel' +
      '<input name="id">' +
      '</label></form>';
    var node = fixture.querySelector('[data-testelm="1"]');

    assert.isTrue(
      axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
    );
  });

  (shadowSupport.v1 ? it : xit)(
    'should find duplicate IDs in the same shadow DOM',
    function () {
      var div = document.createElement('div');
      div.id = 'target';
      var shadow = div.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<span id="target"></span><p id="target">text</p>';
      var node = shadow.querySelector('span');
      fixture.appendChild(div);

      assert.isFalse(
        axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
      );
      assert.lengthOf(checkContext._relatedNodes, 1);
      assert.deepEqual(checkContext._relatedNodes, [shadow.querySelector('p')]);
    }
  );

  (shadowSupport.v1 ? it : xit)(
    'should ignore duplicate IDs if they are in different document roots',
    function () {
      var node = document.createElement('div');
      node.id = 'target';
      var shadow = node.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<span id="target"></span>';
      fixture.appendChild(node);

      assert.isTrue(
        axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
      );
      assert.lengthOf(checkContext._relatedNodes, 0);
    }
  );

  (shadowSupport.v1 ? it : xit)(
    'should ignore same IDs outside shadow trees',
    function () {
      var div = document.createElement('div');
      div.id = 'target';
      var shadow = div.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<span id="target"></span>';
      var node = shadow.querySelector('#target');
      fixture.appendChild(div);

      assert.isTrue(
        axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
      );
      assert.lengthOf(checkContext._relatedNodes, 0);
    }
  );

  (shadowSupport.v1 ? it : xit)(
    'should compare slotted content with the light DOM',
    function () {
      var node = document.createElement('div');
      node.id = 'target';
      node.innerHTML = '<p id="target">text</p>';
      var shadow = node.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<span id="target"><slot></slot></span>';
      fixture.appendChild(node);

      assert.isFalse(
        axe.testUtils.getCheckEvaluate('duplicate-id').call(checkContext, node)
      );
      assert.lengthOf(checkContext._relatedNodes, 1);
      assert.deepEqual(checkContext._relatedNodes, [node.querySelector('p')]);
    }
  );
});
