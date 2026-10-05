const test = require('node:test');
const assert = require('node:assert/strict');
const { createMotionSubscriptions } = require('../../app/utils/motionSubscriptions');

function fixture(initial = 'active') {
  const events = new Set();
  const states = new Set();
  const intervals = [];
  const sensor = {
    setUpdateInterval: (ms) => intervals.push(ms),
    addListener: (fn) => { events.add(fn); return { remove: () => events.delete(fn) }; },
  };
  const appState = {
    currentState: initial,
    addEventListener: (_, fn) => { states.add(fn); return { remove: () => states.delete(fn) }; },
  };
  return {
    subscribe: createMotionSubscriptions(sensor, appState), events, states, intervals,
    state(value) { appState.currentState = value; for (const fn of states) fn(value); },
  };
}

test('five orientation consumers and level share one sensor and restore the required interval', () => {
  const f = fixture();
  let received = 0;
  const remove = Array.from({ length: 5 }, () => f.subscribe(() => received++, 200));
  const removeLevel = f.subscribe(() => received++, 50);
  assert.equal(f.events.size, 1);
  assert.equal(f.states.size, 1);
  for (const fn of f.events) fn({ orientation: 90 });
  assert.equal(received, 6);
  removeLevel();
  assert.deepEqual(f.intervals, [200, 50, 200]);
  remove.forEach((fn) => fn());
  assert.equal(f.events.size, 0);
  assert.equal(f.states.size, 0);
});

test('background suspends motion; foreground resumes one listener at the fastest interval', () => {
  const f = fixture();
  const stop = f.subscribe(() => {}, 50);
  for (let i = 0; i < 20; i++) {
    f.state('inactive'); f.state('background');
    assert.equal(f.events.size, 0);
    f.state('active'); f.state('active');
    assert.equal(f.events.size, 1);
    assert.equal(f.intervals.at(-1), 50);
  }
  stop(); stop();
  f.state('active');
  assert.equal(f.events.size, 0);
  assert.equal(f.states.size, 0);
});

test('a consumer mounted in background never starts motion until active', () => {
  const f = fixture('background');
  const stop = f.subscribe(() => {}, 200);
  assert.equal(f.events.size, 0);
  f.state('active');
  assert.equal(f.events.size, 1);
  stop();
});
