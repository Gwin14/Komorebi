const test = require("node:test");
const assert = require("node:assert/strict");
const { getAppleStylesCompatibility } = require("./photographicStylesPolicy");

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

for (const [name, modes] of [
  ["Retrato", { portraitModeEnabled: true }],
  ["ProRAW", { rawMode: "proRaw" }],
  ["HEIF+ com ProRAW", { rawMode: "proRaw", heifPlusEnabled: true }],
  ["HEIF+ com Bayer", { rawMode: "raw", heifPlusEnabled: true }],
  ["Stacking", { imageStackingEnabled: true }],
]) {
  test(`keeps both Styles modes enabled for ${name}`, () => {
    const result = getAppleStylesCompatibility({
      preferenceEnabled: true,
      styles3PreferenceEnabled: true,
      ...modes,
    });
    assert.equal(result.effective, true);
    assert.equal(result.styles3Effective, true);
    assert.equal(result.suspensionReason, null);
  });
}

test("suspends both Styles modes for ordinary RAW", () => {
  const result = getAppleStylesCompatibility({
    preferenceEnabled: true,
    styles3PreferenceEnabled: true,
    rawMode: "raw",
  });
  assert.equal(result.effective, false);
  assert.equal(result.styles3Effective, false);
  assert.equal(result.preferenceEnabled, true);
  assert.equal(result.suspensionReason, "RAW");
});

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

test("Styles 3 requires both preferences and follows capture suspensions", () => {
  assert.equal(
    getAppleStylesCompatibility({ preferenceEnabled: true }).styles3Effective,
    false,
  );
  assert.equal(
    getAppleStylesCompatibility({ styles3PreferenceEnabled: true })
      .styles3Effective,
    false,
  );
  const preferences = {
    preferenceEnabled: true,
    styles3PreferenceEnabled: true,
  };
  assert.equal(getAppleStylesCompatibility(preferences).styles3Effective, true);
  assert.equal(
    getAppleStylesCompatibility({ ...preferences, rawMode: "raw" }).styles3Effective,
    false,
  );
  assert.equal(
    getAppleStylesCompatibility({ ...preferences, imageStackingEnabled: true })
      .styles3Effective,
    true,
  );
});

test("pauses both Styles modes for Live Photo and restores both preferences", () => {
  const preferences = { preferenceEnabled: true, styles3PreferenceEnabled: true };
  const paused = getAppleStylesCompatibility({ ...preferences, livePhotoEnabled: true });
  assert.equal(paused.effective, false);
  assert.equal(paused.styles3Effective, false);
  assert.equal(paused.suspensionReason, "Live Photo");
  assert.equal(paused.preferenceEnabled, true);
  const restored = getAppleStylesCompatibility({ ...preferences, livePhotoEnabled: false });
  assert.equal(restored.effective, true);
  assert.equal(restored.styles3Effective, true);
  assert.equal(restored.suspensionReason, null);
});
