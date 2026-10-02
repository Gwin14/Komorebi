const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toggleFileFormat } = require("./fileFormatSelection");

const modes = ["off", "proRaw", "raw"];
test("switching the last selected format enables the other format", () => {
  assert.deepEqual(toggleFileFormat({ rawMode: "off", processedEnabled: true }, "processed", modes),
    { rawMode: "proRaw", processedEnabled: false });
  assert.deepEqual(toggleFileFormat({ rawMode: "raw", processedEnabled: false }, "raw", modes),
    { rawMode: "off", processedEnabled: true });
});
test("either side can be independently removed from a pair", () => {
  const pair = { rawMode: "raw", processedEnabled: true };
  assert.deepEqual(toggleFileFormat(pair, "processed", modes), { rawMode: "raw", processedEnabled: false });
  assert.deepEqual(toggleFileFormat(pair, "raw", modes), { rawMode: "off", processedEnabled: true });
});
test("both single formats can become a pair", () => {
  assert.deepEqual(toggleFileFormat({ rawMode: "off", processedEnabled: true }, "raw", ["off", "raw"]),
    { rawMode: "raw", processedEnabled: true });
  assert.deepEqual(toggleFileFormat({ rawMode: "proRaw", processedEnabled: false }, "processed", modes),
    { rawMode: "proRaw", processedEnabled: true });
});
test("unsupported RAW never leaves the selection empty", () => {
  const selection = { rawMode: "off", processedEnabled: true };
  for (const target of ["raw", "processed"]) {
    assert.deepEqual(toggleFileFormat(selection, target, ["off"]), selection);
  }
});
test("every transition sequence retains a supported output", () => {
  for (const supported of [modes, ["off", "raw"], ["off"]]) {
    let selection = { rawMode: "off", processedEnabled: true };
    for (const target of ["processed", "raw", "raw", "processed", "raw", "processed", "processed"]) {
      selection = toggleFileFormat(selection, target, supported);
      assert.ok(selection.processedEnabled || selection.rawMode !== "off");
      assert.ok(supported.includes(selection.rawMode));
    }
  }
});
