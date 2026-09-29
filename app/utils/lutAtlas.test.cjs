const assert = require("node:assert/strict");
const test = require("node:test");
const { buildLutAtlas } = require("./lutAtlas");

test("LUT atlas keeps cube channel order and duplicates slice edges", () => {
  const cube = {
    size: 2,
    lut: Array.from({ length: 8 }, (_, index) => ({
      r: index & 1,
      g: (index >> 1) & 1,
      b: (index >> 2) & 1,
    })),
  };
  const atlas = buildLutAtlas(cube);
  const pixel = (x, y) => [...atlas.pixels.slice((y * atlas.width + x) * 4, (y * atlas.width + x) * 4 + 4)];

  assert.equal(atlas.width, 8);
  assert.equal(atlas.height, 2);
  assert.deepEqual(pixel(1, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(2, 1), [255, 255, 0, 255]);
  assert.deepEqual(pixel(5, 0), [0, 0, 255, 255]);
  assert.deepEqual(pixel(6, 1), [255, 255, 255, 255]);
  assert.deepEqual(pixel(3, 1), pixel(2, 1));
  assert.deepEqual(pixel(4, 1), pixel(5, 1));
});
