const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAppleStylesCompatibility,
} = require("./photographicStylesPolicy");

test("enables compatibility for normal photos", () => {
  assert.equal(
    getAppleStylesCompatibility({ preferenceEnabled: true }).effective,
    true,
  );
});

test("keeps compatibility enabled for image stacking", () => {
  assert.equal(
    getAppleStylesCompatibility({
      preferenceEnabled: true,
      imageStackingEnabled: true,
    }).effective,
    true,
  );
});

for (const [name, modes, reason] of [
  ["Live Photo", { livePhotoEnabled: true }, "Live Photo"],
  ["portrait", { portraitModeEnabled: true }, "Retrato"],
  ["ProRAW", { rawMode: "proRaw" }, "RAW"],
  ["RAW", { rawMode: "raw" }, "RAW"],
]) {
  test(`suspends compatibility for ${name}`, () => {
    const result = getAppleStylesCompatibility({
      preferenceEnabled: true,
      ...modes,
    });
    assert.equal(result.effective, false);
    assert.equal(result.preferenceEnabled, true);
    assert.equal(result.suspensionReason, reason);
  });
}

test("restores compatibility without changing the preference", () => {
  const suspended = getAppleStylesCompatibility({
    preferenceEnabled: true,
    rawMode: "raw",
  });
  const restored = getAppleStylesCompatibility({
    preferenceEnabled: suspended.preferenceEnabled,
    rawMode: "off",
  });

  assert.equal(restored.preferenceEnabled, true);
  assert.equal(restored.effective, true);
  assert.equal(restored.suspensionReason, null);
});
