const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  focusPositions,
  isFocusRangeValid,
  createFocusScheduler,
  stackingMetadataFields,
} = require("./focusBracketing");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const config = { nearLensPosition: 0.2, farLensPosition: 0.8, frameCount: 10 };

test("positions include both limits and evenly cover the interval for 3, 10 and 20 frames", () => {
  for (const frameCount of [3, 10, 20]) {
    const positions = focusPositions({ ...config, frameCount });
    assert.equal(positions.length, frameCount);
    assert.equal(positions[0], 0.2);
    assert.equal(positions.at(-1), 0.8);
    for (let i = 1; i < frameCount; i++)
      assert.ok(
        Math.abs(positions[i] - positions[i - 1] - 0.6 / (frameCount - 1)) <
          1e-10,
      );
  }
  assert.deepEqual(
    focusPositions({ nearLensPosition: 0, farLensPosition: 1, frameCount: 3 }),
    [0, 0.5, 1],
  );
});
test("rejects missing, reversed, identical, nonfinite and out-of-bounds intervals and counts", () => {
  for (const patch of [
    { nearLensPosition: null },
    { nearLensPosition: -0.1 },
    { nearLensPosition: NaN },
    { farLensPosition: Infinity },
    { farLensPosition: 1.1 },
    { farLensPosition: 0.2 },
    { farLensPosition: 0.1 },
    { frameCount: 2 },
    { frameCount: 21 },
    { frameCount: 3.5 },
    { frameCount: "10" },
  ]) {
    assert.equal(isFocusRangeValid({ ...config, ...patch }), false);
    assert.throws(() => focusPositions({ ...config, ...patch }));
  }
});
test("rapid dragging serializes native requests and confirms only the latest requested focus", async () => {
  const calls = [],
    confirmations = [],
    resolvers = [],
    pending = [];
  const scheduler = createFocusScheduler(
    (value) => {
      calls.push(value);
      return new Promise((resolve) => resolvers.push(resolve));
    },
    (value) => confirmations.push(value),
    assert.fail,
    (value) => pending.push(value),
  );
  scheduler.request(0.1);
  scheduler.request(0.2);
  scheduler.request(0.3);
  assert.deepEqual(calls, [0.1]);
  resolvers.shift()(0.1);
  await tick();
  assert.deepEqual(calls, [0.1, 0.3]);
  assert.deepEqual(confirmations, []);
  resolvers.shift()(0.3);
  await tick();
  assert.deepEqual(confirmations, [0.3]);
  assert.equal(pending.at(-1), false);
});
test("changing lens invalidates old confirmations and pending requests", async () => {
  let resolve;
  const confirmations = [],
    errors = [];
  const scheduler = createFocusScheduler(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    (value) => confirmations.push(value),
    (error) => errors.push(error),
    () => {},
  );
  scheduler.request(0.1);
  scheduler.request(0.9);
  scheduler.invalidate();
  resolve(0.1);
  await tick();
  assert.deepEqual(confirmations, []);
  assert.deepEqual(errors, []);
});
test("a failed adjustment disables confirmation and later requests can recover", async () => {
  const confirmations = [],
    errors = [];
  const scheduler = createFocusScheduler(
    async (value) => {
      if (value === 0.1) throw new Error("camera");
      return value;
    },
    (value) => confirmations.push(value),
    (error) => errors.push(error.message),
    () => {},
  );
  scheduler.request(0.1);
  await tick();
  assert.deepEqual(errors, ["camera"]);
  assert.deepEqual(confirmations, []);
  scheduler.request(0.3);
  await tick();
  assert.deepEqual(confirmations, [0.3]);
});
test("focus metadata round-trips and legacy stacking metadata retains its original shape", () => {
  const legacy = {
    strategyId: "bulb",
    capturedFrames: 12,
    acceptedFrames: 12,
    rejectedFrames: 0,
    durationSeconds: 3,
    degraded: false,
  };
  assert.deepEqual(stackingMetadataFields(legacy), {
    engineVersion: 1,
    ...legacy,
  });
  assert.equal(stackingMetadataFields(null), undefined);
  assert.deepEqual(
    stackingMetadataFields({ ...legacy, focusBracketing: null }),
    { engineVersion: 1, ...legacy },
  );
  const focusBracketing = {
    ...config,
    confirmedLensPositions: focusPositions(config),
  };
  const result = stackingMetadataFields({
    ...legacy,
    strategyId: "focusBracketing",
    focusBracketing,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)).focusBracketing,
    focusBracketing,
  );
});

test("range handles cannot cross or leave the focus scale", () => {
  const { clampFocusEndpoint } = require("./focusBracketing");
  assert.equal(clampFocusEndpoint("near", -0.5, 0.25, 0.75), 0);
  assert.equal(clampFocusEndpoint("far", 1.5, 0.25, 0.75), 1);
  assert.equal(clampFocusEndpoint("near", 0.9, 0.25, 0.75), 0.749);
  assert.equal(clampFocusEndpoint("far", 0.1, 0.25, 0.75), 0.251);
  assert.equal(clampFocusEndpoint("near", 0.12345, 0.25, 0.75), 0.123);
});

test("switching handles confirms each endpoint with its own camera readback", async () => {
  const resolvers = [],
    confirmations = [];
  const scheduler = createFocusScheduler(
    () => new Promise((resolve) => resolvers.push(resolve)),
    (value, endpoint, requested) =>
      confirmations.push({ value, endpoint, requested }),
    assert.fail,
    () => {},
  );
  scheduler.request(0.25, "near");
  scheduler.request(0.75, "far");
  resolvers.shift()(0.25001);
  await tick();
  assert.deepEqual(confirmations, [
    { value: 0.25001, endpoint: "near", requested: 0.25 },
  ]);
  resolvers.shift()(0.75001);
  await tick();
  assert.deepEqual(confirmations.at(-1), {
    value: 0.75001,
    endpoint: "far",
    requested: 0.75,
  });
});
