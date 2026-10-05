const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks } = require("../../tests/helpers/hooks.cjs");

test("Styles 3 preference defaults to off and is restored independently", async () => {
  const stored = new Map();
  const { loadStoredSettings, SETTINGS_STORAGE_KEYS } = loadModule("app/utils/settingsStorage.js", {
    "react-native": { Platform: { OS: "ios" } },
    "@react-native-async-storage/async-storage": {
      multiGet: async (keys) => keys.map((key) => [key, stored.get(key) ?? null]),
    },
  });
  const defaults = { photographicStyles3Enabled: false, preserveApplePhotographicStyles: false };
  assert.equal((await loadStoredSettings(defaults)).photographicStyles3Enabled, false);
  stored.set(SETTINGS_STORAGE_KEYS.PHOTOGRAPHIC_STYLES_3_ENABLED, "true");
  const settings = await loadStoredSettings(defaults);
  assert.equal(settings.photographicStyles3Enabled, true);
  assert.equal(settings.preserveApplePhotographicStyles, false);
});

test("capture jobs retain Styles 3 and camera identity with and without effects", async () => {
  const { buildPhotoProcessingData } = loadModule("app/utils/cameraUtils.js", {
    "expo-file-system/legacy": {}, "expo-location": {}, "expo-media-library": {},
    "expo-image-manipulator": {
      SaveFormat: { JPEG: "jpeg" }, manipulateAsync: async () => ({ uri: "file:///crop.jpg" }),
    },
    "react-native": { Image: { getSize: (_, ready) => ready(3000, 4000) } },
    "../../modules/camera-live-photo": {}, "../../modules/camera-portrait-capture": {},
    "../../modules/camera-raw-capture": {}, "./lutStore": {}, "./projects": {},
    "./komorebiExifMetadata": { buildKomorebiExifMetadata: () => ({}) },
    "./lutProcessor": { applyLUTToImage: async () => ({ needsProcessing: true, cube: [1] }) },
  });
  for (const [selectedLutId, captureMode] of [["none", "standard"], ["lut", "standard"], ["none", "stacking"]]) {
    const job = await buildPhotoProcessingData({
      uri: "file:///capture.jpg", selectedLutId, lutsLoaded: true, aspectRatio: 3 / 4,
      captureMode, preserveApplePhotographicStyles: true,
      photographicStyles3Enabled: true, cameraPosition: "front",
    });
    assert.equal(job.photographicStyles3Enabled, true);
    assert.equal(job.cameraPosition, "front");
    assert.equal(job.captureMode, captureMode);
  }
});

for (const [enabled, styles3Verified, shouldSave] of [
  [true, true, true], [true, false, false], [true, undefined, false], [false, undefined, true],
]) {
  test(`Styles 3=${enabled}, verification=${styles3Verified}: saves=${shouldSave}`, async () => {
    const hooks = createHooks();
    const nativeCalls = [], saves = [], catalogWrites = [], deleted = [], alerts = [], expoDeleted = [];
    const noop = async () => {};
    const { default: useQueue } = loadModule("app/hooks/usePhotoProcessingQueue.js", {
      react: hooks.react,
      "react-native": {
        Alert: { alert: (...args) => alerts.push(args) },
        AppState: { addEventListener: () => ({ remove() {} }) },
        DeviceEventEmitter: { addListener: () => ({ remove() {} }), emit() {} },
      },
      "expo-file-system/legacy": { deleteAsync: async (uri) => expoDeleted.push(uri) },
      "../../modules/composition-scan": {}, "../../modules/camera-live-photo": {},
      "../../modules/camera-raw-capture": { listHeifPlusJobs: async () => [] },
      "../../modules/camera-portrait-capture": { convertPhotoFormat: async () => "file:///p3.heic" },
      "../../modules/camera-photographic-styles": {
        makePhotoStylesCompatible: async (_, options) => {
          nativeCalls.push(options);
          return { photoUri: "file:///styles.heic", verified: true, styles3Verified };
        },
        updatePhotoAssetMetadata: async () => true,
        deletePhotographicStylesTemporaryPhoto: async (uri) => deleted.push(uri),
      },
      "../utils/cameraUtils": {
        saveToAlbum: async (_, uri) => { saves.push(uri); return { id: "asset" }; },
      },
      "../utils/komorebiExifMetadata": { saveKomorebiAssetMetadata: noop },
      "../utils/photoIntelligence": { applyPhotoIntelligenceToMetadata: () => ({}) },
      "../utils/projects": {},
      "../utils/photoCatalogMetadata": {
        writePhotoCatalogMetadata: async (uri) => { catalogWrites.push(uri); return uri; },
        deleteCatalogTemporaryPhoto: noop,
      },
    });
    const queue = hooks.render(() => useQueue(true, null, { author: "Fotógrafo" }));
    await queue.handleProcessed("file:///processed.jpg", {
      originalUri: "file:///capture.jpg", outputFormat: "heif",
      preserveApplePhotographicStyles: true, photographicStyles3Enabled: enabled,
      cameraPosition: "front",
    });
    assert.equal(nativeCalls[0].enableStyles3, enabled);
    assert.equal(nativeCalls[0].cameraPosition, "front");
    assert.equal(nativeCalls[0].metadata.catalogMetadata.author, "Fotógrafo");
    assert.equal(saves.length, shouldSave ? 1 : 0);
    assert.equal(alerts.length, shouldSave ? 0 : 1);
    assert.equal(catalogWrites.length, 0, "neither Styles mode rewrites the finished HEIF");
    assert.ok(deleted.includes("file:///styles.heic"));
    assert.ok(deleted.includes("file:///p3.heic"));
    assert.deepEqual(expoDeleted, [], "native temporary photos bypass Expo directory permissions");
    hooks.dispose();
  });
}
