describe('autocomplete-a11y-matches', () => {
  const fixture = document.getElementById('fixture');
  const queryFixture = axe.testUtils.queryFixture;
  const rule = axe.utils.getRule('autocomplete-valid');

  afterEach(() => {
    fixture.innerHTML = '';
  });

  // The label[for] lookup only runs when node.labels is unavailable.
  function withoutLabelsProperty(vNode) {
    Object.defineProperty(vNode.actualNode, 'labels', { value: null });
    return vNode;
  }

  it('does not throw for an id containing double quotes', () => {
    const vNode = withoutLabelsProperty(
      queryFixture(
        '<label for=\'Legs_1" X 1"\'>Full name</label>' +
          '<input id=\'Legs_1" X 1"\' autocomplete="name">',
        'input'
      )
    );
    assert.doesNotThrow(() => rule.matches(vNode.actualNode, vNode));
  });

  it('still finds the label[for] of an id containing double quotes', () => {
    const vNode = withoutLabelsProperty(
      queryFixture(
        "<label for='Diameter_0.032\"'>Search</label>" +
          '<input id=\'Diameter_0.032"\' autocomplete="name">',
        'input'
      )
    );
    // The label text "Search" marks the field as search, so it is not matched.
    assert.isFalse(rule.matches(vNode.actualNode, vNode));
  });

  describe('input types that cannot collect user information', () => {
    it('returns false for a range slider without autocomplete', () => {
      const vNode = queryFixture(
        '<input id="target" type="range" min="1" max="23" aria-label="Layover hours">'
      );
      assert.isFalse(rule.matches(vNode.actualNode, vNode));
    });

    it('returns false for a colour picker without autocomplete', () => {
      const vNode = queryFixture(
        '<input id="target" type="color" aria-label="Theme colour">'
      );
      assert.isFalse(rule.matches(vNode.actualNode, vNode));
    });

    ['week', 'time', 'datetime-local'].forEach(type => {
      it(`returns false for input[type=${type}] without autocomplete`, () => {
        const vNode = queryFixture(
          `<input id="target" type="${type}" aria-label="Departure">`
        );
        assert.isFalse(rule.matches(vNode.actualNode, vNode));
      });
    });

    it('treats an upper-case type and a blank autocomplete as unset', () => {
      const vNode = queryFixture(
        '<input id="target" type="RANGE" autocomplete="  " aria-label="Price">'
      );
      assert.isFalse(rule.matches(vNode.actualNode, vNode));
    });

    it('still returns true for a colour picker with autocomplete="off"', () => {
      const vNode = queryFixture(
        '<input id="target" type="color" autocomplete="off" aria-label="Theme colour">'
      );
      assert.isTrue(rule.matches(vNode.actualNode, vNode));
    });

    it('still returns true for a range slider with an authored autocomplete', () => {
      const vNode = queryFixture(
        '<input id="target" type="range" autocomplete="email" aria-label="Amount">'
      );
      assert.isTrue(rule.matches(vNode.actualNode, vNode));
    });

    it('still returns true for a text field without autocomplete', () => {
      const vNode = queryFixture(
        '<input id="target" type="text" aria-label="Full name">'
      );
      assert.isTrue(rule.matches(vNode.actualNode, vNode));
    });

    it('still returns true for a date field without autocomplete', () => {
      const vNode = queryFixture(
        '<input id="target" type="date" aria-label="Date of birth">'
      );
      assert.isTrue(rule.matches(vNode.actualNode, vNode));
    });

    it('still returns true for an unknown type, which renders as a text field', () => {
      const vNode = queryFixture(
        '<input id="target" type="slider" aria-label="Amount">'
      );
      assert.isTrue(rule.matches(vNode.actualNode, vNode));
    });
  });
});
