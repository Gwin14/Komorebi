const test = require("node:test");
const assert = require("node:assert/strict");
const { restoreZebraPreferences } = require("./zebraSettings");

test("zebras are disabled by default", () => {
  assert.deepEqual(restoreZebraPreferences(), {
    zebraHighlightsEnabled: false,
    zebraShadowsEnabled: false,
  });
});

test("restores highlight and shadow zebras independently", () => {
  assert.deepEqual(
    restoreZebraPreferences({ highlights: "true", shadows: "false" }),
    { zebraHighlightsEnabled: true, zebraShadowsEnabled: false },
  );
});
