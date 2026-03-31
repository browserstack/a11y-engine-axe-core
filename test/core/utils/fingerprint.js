describe('utils.computeFingerprintHash', function () {
  'use strict';

  var computeFingerprintHash = axe.utils.computeFingerprintHash;

  it('should return a 16-character hex string', function () {
    var result = computeFingerprintHash(
      '<button type="submit">Click me</button>'
    );
    assert.match(result, /^[0-9a-f]{16}$/);
  });

  it('should return null for null/undefined/empty input', function () {
    assert.isNull(computeFingerprintHash(null));
    assert.isNull(computeFingerprintHash(undefined));
    assert.isNull(computeFingerprintHash(''));
  });

  it('should be deterministic', function () {
    var html = '<div class="card">Hello</div>';
    assert.strictEqual(
      computeFingerprintHash(html),
      computeFingerprintHash(html)
    );
  });

  it('should produce different hashes for different textContent', function () {
    var html1 = '<button>Delete</button>';
    var html2 = '<button>Keep</button>';
    assert.notEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should produce same hash regardless of attribute ordering', function () {
    var html1 = '<button type="submit" role="button">Click</button>';
    var html2 = '<button role="button" type="submit">Click</button>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should filter CSS-in-JS dynamic classes', function () {
    var html1 = '<div class="card css-1a2b3c4d">Hello</div>';
    var html2 = '<div class="card css-9x8y7z6w">Hello</div>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should strip data-* attributes', function () {
    var html1 = '<div data-testid="my-div">Hello</div>';
    var html2 = '<div>Hello</div>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should strip positional styles and keep visual ones', function () {
    var html1 = '<div style="color: red; top: 10px;">Hello</div>';
    var html2 = '<div style="color: red; top: 50px;">Hello</div>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should distinguish different visual styles', function () {
    var html1 = '<div style="color: red;">Hello</div>';
    var html2 = '<div style="color: blue;">Hello</div>';
    assert.notEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should strip href query strings', function () {
    var html1 = '<a href="/page?q=1">Link</a>';
    var html2 = '<a href="/page?q=2">Link</a>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should normalize textContent whitespace', function () {
    var html1 = '<div>Home  Products\n  About</div>';
    var html2 = '<div>Home Products About</div>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should handle void elements', function () {
    var html = '<img src="/photo.jpg" alt="A photo" width="100">';
    var result = computeFingerprintHash(html);
    assert.match(result, /^[0-9a-f]{16}$/);
  });

  it('should sort aria-* attributes', function () {
    var html1 = '<button aria-label="Close" aria-expanded="true">X</button>';
    var html2 = '<button aria-expanded="true" aria-label="Close">X</button>';
    assert.strictEqual(
      computeFingerprintHash(html1),
      computeFingerprintHash(html2)
    );
  });

  it('should handle large subtree elements', function () {
    var html =
      '<nav role="navigation"><ul><li><a href="/home">Home</a></li><li><a href="/about">About</a></li></ul></nav>';
    var result = computeFingerprintHash(html);
    assert.match(result, /^[0-9a-f]{16}$/);
  });
});
