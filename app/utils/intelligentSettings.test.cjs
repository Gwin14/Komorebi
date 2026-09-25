const test = require("node:test");
const assert = require("node:assert/strict");
const { restoreIntelligentPreferences } = require("./intelligentSettings");

test("intelligent preferences are disabled by default", () => {
  assert.deepEqual(restoreIntelligentPreferences(), {
    compositionScanEnabled: false,
    intelligentTagsEnabled: false,
    intelligentFilenameEnabled: false,
  });
});

test("restores intelligent preferences independently of model availability", () => {
  assert.deepEqual(
    restoreIntelligentPreferences(
      { compositionScan: "true", tags: "true", filename: "true" },
      { compositionScanEnabled: false, intelligentTagsEnabled: false, intelligentFilenameEnabled: false },
    ),
    { compositionScanEnabled: true, intelligentTagsEnabled: true, intelligentFilenameEnabled: true },
  );
});

test("keeps the three intelligent preferences independent", () => {
  assert.deepEqual(
    restoreIntelligentPreferences({ compositionScan: "true", tags: "false", filename: "true" }),
    { compositionScanEnabled: true, intelligentTagsEnabled: false, intelligentFilenameEnabled: true },
  );
});
