const test = require("node:test");
const assert = require("node:assert/strict");
const { restoreIntelligentPreferences } = require("./intelligentSettings");

test("intelligent preferences are disabled by default", () => {
  assert.deepEqual(restoreIntelligentPreferences(), {
    intelligentTagsEnabled: false,
    intelligentFilenameEnabled: false,
  });
});

test("restores intelligent preferences independently of model availability", () => {
  assert.deepEqual(
    restoreIntelligentPreferences(
      { tags: "true", filename: "true" },
      { intelligentTagsEnabled: false, intelligentFilenameEnabled: false },
    ),
    { intelligentTagsEnabled: true, intelligentFilenameEnabled: true },
  );
});
