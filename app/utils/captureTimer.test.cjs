const test = require("node:test");
const assert = require("node:assert/strict");
const { createCaptureCountdown, normalizeCaptureTimer } = require("./captureTimer");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks, deferred } = require("../../tests/helpers/hooks.cjs");

function fixture(t, seconds = 3) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const hooks = createHooks();
  const listeners = new Set();
  const appState = {
    currentState: "active",
    addEventListener: (_, fn) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  };
  let captures = 0;
  const useCaptureTimer = loadModule("app/hooks/useCaptureTimer.js", {
    react: { ...hooks.react, useLayoutEffect: hooks.react.useEffect },
    "react-native": { AppState: appState },
  }).default;
  const options = {
    seconds, enabled: true, configurationKey: "back:normal",
    onCapture: () => { captures++; },
  };
  const render = () => hooks.render(() => useCaptureTimer(options));
  const background = () => {
    appState.currentState = "background";
    listeners.forEach((fn) => fn("background"));
  };
  t.after(() => hooks.dispose());
  return { hooks, options, render, background, captures: () => captures, listeners };
}

test("only off, 3 seconds and 10 seconds are restored", () => {
  for (const value of [null, undefined, "", "bad", -3, 1, 5, Infinity]) {
    assert.equal(normalizeCaptureTimer(value), 0);
  }
  assert.equal(normalizeCaptureTimer("3"), 3);
  assert.equal(normalizeCaptureTimer("10"), 10);
});

for (const seconds of [3, 10]) {
  test(`captures once after ${seconds}s, ignoring repeated shutter/smile requests`, async (t) => {
    const f = fixture(t, seconds);
    const pending = f.render().requestCapture();
    assert.equal(f.render().remaining, seconds);
    await f.render().requestCapture();
    t.mock.timers.tick(seconds * 1000 - 1);
    assert.equal(f.captures(), 0);
    assert.equal(f.render().remaining, 1);
    t.mock.timers.tick(1);
    await pending;
    assert.equal(f.captures(), 1);
    assert.equal(f.render().remaining, 0);
  });
}

test("off and continuous exposure stop capture immediately", async (t) => {
  const f = fixture(t, 0);
  await f.render().requestCapture();
  assert.equal(f.captures(), 1);
  f.options.seconds = 10;
  await f.render().requestCapture({ immediate: true });
  assert.equal(f.captures(), 2);
  assert.equal(f.render().remaining, 0);
});

for (const reason of ["cancel", "disabled", "camera change", "timer change", "background", "unmount"]) {
  test(`${reason} cancels without taking a photo`, async (t) => {
    const f = fixture(t);
    const pending = f.render().requestCapture();
    t.mock.timers.tick(1000);
    if (reason === "cancel") f.render().cancel();
    if (reason === "disabled") { f.options.enabled = false; f.render(); }
    if (reason === "camera change") { f.options.configurationKey = "front:live"; f.render(); }
    if (reason === "timer change") { f.options.seconds = 10; f.render(); }
    if (reason === "background") f.background();
    if (reason === "unmount") f.hooks.dispose();
    t.mock.timers.tick(20000);
    await pending;
    assert.equal(f.captures(), 0);
    assert.equal(f.render().remaining, 0);
  });
}

test("capture uses the latest effects/settings callback at the deadline", async (t) => {
  const f = fixture(t);
  const pending = f.render().requestCapture();
  let latestUsed = false;
  f.options.onCapture = () => { latestUsed = true; };
  f.render();
  t.mock.timers.tick(3000);
  await pending;
  assert.equal(latestUsed, true);
  assert.equal(f.captures(), 0);
});

test("an ongoing native capture does not block its finishing shutter press", async (t) => {
  const f = fixture(t);
  const capture = deferred();
  f.options.onCapture = () => capture.promise;
  const pending = f.render().requestCapture();
  t.mock.timers.tick(3000);
  await Promise.resolve();
  let stopped = false;
  f.options.onCapture = () => { stopped = true; capture.resolve(); };
  await f.render().requestCapture({ immediate: true });
  await pending;
  assert.equal(stopped, true);
});

test("a late JS tick uses elapsed time instead of extending the countdown", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const ticks = [];
  const countdown = createCaptureCountdown(3, (value) => ticks.push(value));
  t.mock.timers.tick(5000);
  assert.equal(await countdown.finished, true);
  assert.deepEqual(ticks, [3, 0]);
});
