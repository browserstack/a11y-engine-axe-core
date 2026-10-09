describe('axe.utils.collectResultsFromFrames', () => {
  const Context = axe._thisWillBeDeletedDoNotUse.base.Context;
  const fixture = document.getElementById('fixture');
  const noop = () => {};
  const origSetTimeout = window.setTimeout;

  function contextSetup(scope) {
    const context = new Context(scope);
    axe._tree = context.flatTree;
    axe._selectorData = axe.utils.getSelectorData(context.flatTree);

    return context;
  }

  beforeEach(() => {
    axe._setLogger(noop);
  });

  afterEach(() => {
    window.setTimeout = origSetTimeout;
    fixture.innerHTML = '';
    axe._tree = undefined;
    axe._selectorData = undefined;
  });

  it('should timeout the ping request after 500ms', function (done) {
    this.timeout = 1000;

    let timeoutSet = false;
    window.setTimeout = (fn, to) => {
      if (to === 500) {
        timeoutSet = true;
        fn();
      } else {
        // ping timeout
        return origSetTimeout(fn, to);
      }
      return 'cats';
    };

    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);

      axe.utils.collectResultsFromFrames(
        context,
        {},
        'stuff',
        'morestuff',
        () => {
          assert.isTrue(timeoutSet);
          done();
        },
        noop
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should override the ping timeout with `options.pingWaitTime`, if provided', function (done) {
    this.timeout = 1000;

    let timeoutSet = false;
    window.setTimeout = (fn, to) => {
      if (to === 90000) {
        timeoutSet = true;
        fn();
      } else {
        // ping timeout
        return origSetTimeout(fn, to);
      }
      return 'cats';
    };

    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);
      const params = { pingWaitTime: 90000 };

      axe.utils.collectResultsFromFrames(
        context,
        params,
        'stuff',
        'morestuff',
        () => {
          assert.isTrue(timeoutSet);
          done();
        },
        noop
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should skip the frame when the start request times out after 60s', done => {
    let timeoutSet = false;
    window.setTimeout = (fn, to) => {
      if (to === 60000) {
        timeoutSet = true;
        fn();
      } else {
        // ping timeout
        return origSetTimeout(fn, to);
      }
      return 'cats';
    };

    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);
      axe.utils.collectResultsFromFrames(
        context,
        {},
        'stuff',
        'morestuff',
        results => {
          assert.isTrue(timeoutSet);
          assert.deepEqual(results, []);
          done();
        },
        err => {
          done(err);
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should override the start timeout with `options.frameWaitTime`, if provided', done => {
    let timeoutSet = false;
    window.setTimeout = (fn, to) => {
      if (to === 90000) {
        timeoutSet = true;
        fn();
      } else {
        // ping timeout
        return origSetTimeout(fn, to);
      }
      return 'cats';
    };

    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);
      const params = { frameWaitTime: 90000 };

      axe.utils.collectResultsFromFrames(
        context,
        params,
        'stuff',
        'morestuff',
        results => {
          assert.isTrue(timeoutSet);
          assert.deepEqual(results, []);
          done();
        },
        err => {
          done(err);
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should skip the frame when its document is replaced before the start request is answered', done => {
    const frame = document.createElement('iframe');
    window.setTimeout = (fn, to) => {
      if (to === 60000) {
        // axe.start has been sent; replace the document it was sent to.
        frame.src = '../mock/frames/zombie-frame.html';
        return 'cats';
      }
      return origSetTimeout(fn, to);
    };

    frame.addEventListener('load', function onFirstLoad() {
      frame.removeEventListener('load', onFirstLoad);
      const context = contextSetup(document);
      axe.utils.collectResultsFromFrames(
        context,
        {},
        'stuff',
        'morestuff',
        results => {
          assert.deepEqual(results, []);
          done();
        },
        err => {
          done(err);
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should skip the frame when it is removed before the start request is answered', done => {
    const frame = document.createElement('iframe');
    window.setTimeout = (fn, to) => {
      if (to === 60000) {
        // axe.start has been sent; remove the frame it was sent to.
        frame.remove();
        return 'cats';
      }
      return origSetTimeout(fn, to);
    };

    frame.addEventListener('load', () => {
      const context = contextSetup(document);
      axe.utils.collectResultsFromFrames(
        context,
        {},
        'stuff',
        'morestuff',
        results => {
          assert.deepEqual(results, []);
          done();
        },
        err => {
          done(err);
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should keep waiting when the frame fires load for the document the start request was sent to', done => {
    const frame = document.createElement('iframe');
    let startTimedOut = false;
    window.setTimeout = (fn, to) => {
      if (to === 60000) {
        // The same document finishing its load is not a replacement.
        frame.dispatchEvent(new Event('load'));
        origSetTimeout(() => {
          startTimedOut = true;
          fn();
        }, 50);
        return 'cats';
      }
      return origSetTimeout(fn, to);
    };

    frame.addEventListener('load', function onFirstLoad() {
      frame.removeEventListener('load', onFirstLoad);
      const context = contextSetup(document);
      axe.utils.collectResultsFromFrames(
        context,
        {},
        'stuff',
        'morestuff',
        results => {
          if (!startTimedOut) {
            done(
              new Error('frame was skipped before the start request timed out')
            );
            return;
          }
          assert.deepEqual(results, []);
          done();
        },
        err => {
          done(err);
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/results-timeout.html';
    fixture.appendChild(frame);
  });

  it('should not throw given a recursive iframe', done => {
    axe._load({
      rules: [
        {
          id: 'iframe',
          selector: 'iframe',
          any: [
            {
              id: 'iframe',
              evaluate: () => {
                return true;
              }
            }
          ]
        }
      ],
      messages: {}
    });

    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);

      axe.utils.collectResultsFromFrames(
        context,
        {},
        'rules',
        'morestuff',
        () => {
          done();
        },
        e => {
          assert.ok(false, e);
          done();
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/nested0.html';
    fixture.appendChild(frame);
  });

  it('returns errors send from the frame', done => {
    const frame = document.createElement('iframe');
    frame.addEventListener('load', () => {
      const context = contextSetup(document);
      axe.utils.collectResultsFromFrames(
        context,
        {},
        'rules',
        'morestuff',
        () => {
          done(new Error('Should not be called'));
        },
        err => {
          assert.instanceOf(err, Error);
          assert.equal(err.message.split(/\n/)[0], 'error in axe.throw');
          done();
        }
      );
    });

    frame.id = 'level0';
    frame.src = '../mock/frames/throwing.html';
    fixture.appendChild(frame);
  });
});
