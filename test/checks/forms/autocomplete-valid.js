describe('autocomplete-valid', function () {
  'use strict';

  var fixture = document.getElementById('fixture');
  var checkSetup = axe.testUtils.checkSetup;
  var checkContext = axe.testUtils.MockCheckContext();
  var evaluate = axe.testUtils.getCheckEvaluate('autocomplete-valid');

  afterEach(function () {
    fixture.innerHTML = '';
    checkContext.reset();
  });

  // original axe-core's check test

  // it('returns true if autocomplete is valid', function () {
  //   var params = checkSetup('<input autocomplete="on" id="target" />');
  //   assert.isTrue(evaluate.apply(checkContext, params));
  // });

  // it('returns false if autocomplete is not valid', function () {
  //   var params = checkSetup('<input autocomplete="foo" id="target" />');
  //   assert.isFalse(evaluate.apply(checkContext, params));
  // });

  // it('uses options to change what is valid autocomplete', function () {
  //   var options = { stateTerms: ['foo'] };
  //   var params = checkSetup(
  //     '<input autocomplete="foo" id="target" />',
  //     options
  //   );
  //   assert.isTrue(evaluate.apply(checkContext, params));
  // });

  it("evaluate() passes a document if form element has autocomplete set off and child elements don't have autocomplete", function () {
    console.log('Our functions are running fine');
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set off and child elements have autocomplete as off', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="off" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set off and child elements have standard autcomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="username" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set off, child elements have on autocomplete value and name or id has standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="on" name="name" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() fails a document if form element has autocomplete set off and child elements have on autocomplete value and name or id has non-standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="on" name="xname" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set off, child elements have non-standard autocomplete value and name or id has standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="xname" name="name" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() fails a document if form element has autocomplete set off, child elements have non-standard autocomplete value and name or id has non-standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="off" onsubmit="javascript(0)"> <input autocomplete="xname" name="xname" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set on and child elements have autocomplete set to off', function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input autocomplete="off" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() passes a document if form element doesn't have autocomplete set and child elements have autocomplete set to off", function () {
    var params = checkSetup(
      '<html> <form  onsubmit="javascript(0)"> <input autocomplete="off" type="text" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set on and child elements have autocomplete set to standard irrespective of name and id', function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input autocomplete="name" type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() passes a document if form element doesn't have autocomplete set and child elements have autocomplete set to standard irrespective of name and id", function () {
    var params = checkSetup(
      '<html> <form onsubmit="javascript(0)"> <input autocomplete="name" type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if form element has autocomplete set on and child elements have autocomplete set on and name/id have a standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input autocomplete="on" type="text" name="name" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() passes a document if form element doesn't have autocomplete set and child elements have autocomplete set on and name/id have a standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input autocomplete="on" type="text" name="name" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() fails a document if form element has autocomplete set on and child elements have autocomplete set on and name/id have a non-standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input autocomplete="on" type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it("evaluate() fails a document if form element doesn't have autcomplete set and child elements have autocomplete set on and name/id have a non-standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form onsubmit="javascript(0)"> <input autocomplete="on" type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it("evaluate() passes a document if form element has autocomplete set on and child elements don't have autocomplete set and name/id have a standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input type="text" name="name" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() passes a document if form element doesn't have autocomplete set and child elements don't have autocomplete set and name/id have a standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form onsubmit="javascript(0)"> <input type="text" name="name" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() fails a document if form element has autocomplete set on and child elements don't have autocomplete set and name/id have a non-standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form autocomplete="on" onsubmit="javascript(0)"> <input type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it("evaluate() fails a document if form element doesn't have autocomplete set and child elements don't have autocomplete set and name/id have a non-standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <form onsubmit="javascript(0)"> <input type="text" name="xname" id="target"/> <button>Save</button> </form> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if element is independent and have autocomplete set to off', function () {
    var params = checkSetup(
      '<html> <input autocomplete="off" type="text" id="target"/> <button>Save</button> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if element is independent and have autocomplete set to standard irrespective of name and id', function () {
    var params = checkSetup(
      '<html> <input autocomplete="name" type="text" name="xname" id="target"/> <button>Save</button> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() passes a document if element is independent and have autocomplete set on and name/id have a standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <input autocomplete="on" type="text" name="name" id="target"/> <button>Save</button> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it('evaluate() fails a document if element is independent and have autocomplete set on and name/id have a non-standard autocomplete value', function () {
    var params = checkSetup(
      '<html> <input autocomplete="on" type="text" name="xname" id="target"/> <button>Save</button> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });

  it("evaluate()passes a document if element is independent and don't have autocomplete set and name/id have a standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <input type="text" name="name" id="target"/> <button>Save</button> </html>'
    );
    assert.isTrue(evaluate.apply(checkContext, params));
  });

  it("evaluate() fails a document if element is independent and don't have autocomplete set and name/id have a non-standard autocomplete value", function () {
    var params = checkSetup(
      '<html> <input type="text" name="xname" id="target"/> <button>Save</button> </html>'
    );
    assert.isFalse(evaluate.apply(checkContext, params));
  });
});
