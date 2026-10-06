const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { portraitPreviewFocusPoint } = loadModule("app/utils/portraitPreview.js");

test("portrait focus uses the full native surface for a square center crop", () => {
  const surface = { left: 0, top: -100, width: 400, height: 600 };
  assert.deepEqual(portraitPreviewFocusPoint({ x: 200, y: 200 }, surface), { x: 0.5, y: 0.5 });
  assert.deepEqual(portraitPreviewFocusPoint({ x: 0, y: 0 }, surface), { x: 0, y: 1 / 6 });
  assert.deepEqual(portraitPreviewFocusPoint({ x: 400, y: 400 }, surface), { x: 1, y: 5 / 6 });
});

test("portrait focus includes horizontal offsets in a wide native surface", () => {
  const surface = { left: -100, top: 0, width: 600, height: 400 };
  assert.deepEqual(portraitPreviewFocusPoint({ x: 0, y: 200 }, surface), { x: 1 / 6, y: 0.5 });
  assert.deepEqual(portraitPreviewFocusPoint({ x: 400, y: 200 }, surface), { x: 5 / 6, y: 0.5 });
});

test("portrait focus bounds overscroll and rejects an unmeasured surface", () => {
  assert.deepEqual(portraitPreviewFocusPoint({ x: -5, y: 410 }, { left: 0, top: 0, width: 300, height: 400 }), { x: 0, y: 1 });
  assert.equal(portraitPreviewFocusPoint({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 }), null);
  assert.equal(portraitPreviewFocusPoint({ x: NaN, y: 10 }, { left: 0, top: 0, width: 300, height: 400 }), null);
});
