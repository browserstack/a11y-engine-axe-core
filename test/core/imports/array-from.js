describe('axe.imports.ArrayFrom', () => {
  const arrayFrom = axe.imports.ArrayFrom;
  const fixture = document.getElementById('fixture');

  it('should not be the native Array.from', () => {
    assert.notStrictEqual(arrayFrom, Array.from);
  });

  it('should copy an array', () => {
    const source = [1, 2, 3];
    const result = arrayFrom(source);
    assert.deepEqual(result, [1, 2, 3]);
    assert.notStrictEqual(result, source);
  });

  it('should convert iterables', () => {
    assert.deepEqual(arrayFrom(new Set(['a', 'b'])), ['a', 'b']);
    assert.deepEqual(
      arrayFrom(
        new Map([
          [1, 'x'],
          [2, 'y']
        ])
      ),
      [
        [1, 'x'],
        [2, 'y']
      ]
    );
    assert.deepEqual(arrayFrom('ab'), ['a', 'b']);
  });

  it('should convert array-likes', () => {
    assert.deepEqual(arrayFrom({ length: 2, 0: 'a', 1: 'b' }), ['a', 'b']);
    assert.deepEqual(arrayFrom({ length: 2 }), [undefined, undefined]);
    assert.deepEqual(arrayFrom({}), []);
  });

  it('should convert NodeLists', () => {
    fixture.innerHTML = '<span></span><span></span>';
    const result = arrayFrom(fixture.querySelectorAll('span'));
    assert.lengthOf(result, 2);
    assert.isTrue(Array.isArray(result));
  });

  it('should apply mapFn with index and thisArg', () => {
    const context = { offset: 10 };
    const result = arrayFrom(
      [1, 2],
      function (value, index) {
        return value + index + this.offset;
      },
      context
    );
    assert.deepEqual(result, [11, 13]);
  });

  it('should throw for null or undefined', () => {
    assert.throws(() => arrayFrom(null), TypeError);
    assert.throws(() => arrayFrom(undefined), TypeError);
  });

  it('should throw when mapFn is not a function', () => {
    assert.throws(() => arrayFrom([1], 'nope'), TypeError);
  });
});
