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
});
