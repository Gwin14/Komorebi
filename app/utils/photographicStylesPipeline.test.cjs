const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks } = require("../../tests/helpers/hooks.cjs");

test("Styles 3 preference defaults to off and is restored independently", async () => {
  const stored = new Map();
  const { loadStoredSettings, SETTINGS_STORAGE_KEYS } = loadModule(
    "app/utils/settingsStorage.js",
    {
      "react-native": { Platform: { OS: "ios" } },
      "@react-native-async-storage/async-storage": {
        multiGet: async (keys) =>
          keys.map((key) => [key, stored.get(key) ?? null]),
      },
    },
  );
  const defaults = {
    photographicStyles3Enabled: false,
    preserveApplePhotographicStyles: false,
  };
  assert.equal(
    (await loadStoredSettings(defaults)).photographicStyles3Enabled,
    false,
  );
  stored.set(SETTINGS_STORAGE_KEYS.PHOTOGRAPHIC_STYLES_3_ENABLED, "true");
  const settings = await loadStoredSettings(defaults);
  assert.equal(settings.photographicStyles3Enabled, true);
  assert.equal(settings.preserveApplePhotographicStyles, false);
});

test("capture jobs retain Styles 3 and camera identity with and without effects", async () => {
  const { buildPhotoProcessingData } = loadModule("app/utils/cameraUtils.js", {
    "expo-file-system/legacy": {},
    "expo-location": {},
    "expo-media-library": {},
    "expo-image-manipulator": {
      SaveFormat: { JPEG: "jpeg" },
      manipulateAsync: async () => ({ uri: "file:///crop.jpg" }),
    },
    "react-native": { Image: { getSize: (_, ready) => ready(3000, 4000) } },
    "../../modules/camera-live-photo": {},
    "../../modules/camera-portrait-capture": {},
    "../../modules/camera-raw-capture": {},
    "./lutStore": {},
    "./projects": {},
    "./komorebiExifMetadata": { buildKomorebiExifMetadata: () => ({}) },
    "./lutProcessor": {
      applyLUTToImage: async () => ({ needsProcessing: true, cube: [1] }),
    },
  });
  for (const [selectedLutId, captureMode] of [
    ["none", "standard"],
    ["lut", "standard"],
    ["none", "stacking"],
    ["lut", "stacking"],
    ["none", "live"],
    ["lut", "portrait"],
  ]) {
    const job = await buildPhotoProcessingData({
      uri: "file:///capture.jpg",
      selectedLutId,
      lutsLoaded: true,
      aspectRatio: 3 / 4,
      captureMode,
      preserveApplePhotographicStyles: true,
      photographicStyles3Enabled: true,
      cameraPosition: "front",
    });
    assert.equal(job.photographicStyles3Enabled, true);
    assert.equal(job.cameraPosition, "front");
    assert.equal(job.captureMode, captureMode);
  }
});

for (const [enabled, styles3Verified, shouldSave] of [
  [true, true, true],
  [true, false, false],
  [true, undefined, false],
  [false, undefined, true],
]) {
  test(`Styles 3=${enabled}, verification=${styles3Verified}: saves=${shouldSave}`, async () => {
    const hooks = createHooks();
    const conversions = [],
      nativeCalls = [],
      saves = [],
      catalogWrites = [],
      deleted = [],
      alerts = [],
      expoDeleted = [];
    const noop = async () => {};
    const { default: useQueue } = loadModule(
      "app/hooks/usePhotoProcessingQueue.js",
      {
        react: hooks.react,
        "react-native": {
          Alert: { alert: (...args) => alerts.push(args) },
          AppState: { addEventListener: () => ({ remove() {} }) },
          DeviceEventEmitter: {
            addListener: () => ({ remove() {} }),
            emit() {},
          },
        },
        "expo-file-system/legacy": {
          deleteAsync: async (uri) => expoDeleted.push(uri),
        },
        "../../modules/composition-scan": {},
        "../../modules/camera-live-photo": {},
        "../../modules/camera-raw-capture": {
          listHeifPlusJobs: async () => [],
        },
        "../../modules/camera-portrait-capture": {
          convertPhotoFormat: async (...args) => {
            conversions.push(args);
            return "file:///p3.heic";
          },
        },
        "../../modules/camera-photographic-styles": {
          makePhotoStylesCompatible: async (uri, options) => {
            assert.equal(uri, "file:///processed.jpg");
            nativeCalls.push(options);
            return {
              photoUri: "file:///styles.heic",
              verified: true,
              styles3Verified,
            };
          },
          updatePhotoAssetMetadata: async () => true,
          deletePhotographicStylesTemporaryPhoto: async (uri) =>
            deleted.push(uri),
        },
        "../utils/cameraUtils": {
          saveToAlbum: async (_, uri) => {
            saves.push(uri);
            return { id: "asset" };
          },
        },
        "../utils/komorebiExifMetadata": { saveKomorebiAssetMetadata: noop },
        "../utils/photoIntelligence": {
          applyPhotoIntelligenceToMetadata: () => ({}),
        },
        "../utils/projects": {},
        "../utils/photoCatalogMetadata": {
          writePhotoCatalogMetadata: async (uri) => {
            catalogWrites.push(uri);
            return uri;
          },
          deleteCatalogTemporaryPhoto: noop,
        },
      },
    );
    const queue = hooks.render(() =>
      useQueue(true, null, { author: "Fotógrafo" }),
    );
    await queue.handleProcessed("file:///processed.jpg", {
      originalUri: "file:///capture.jpg",
      outputFormat: "heif",
      preserveApplePhotographicStyles: true,
      photographicStyles3Enabled: enabled,
      cameraPosition: "front",
    });
    assert.equal(nativeCalls[0].enableStyles3, enabled);
    assert.equal(nativeCalls[0].cameraPosition, "front");
    assert.equal(nativeCalls[0].metadata.catalogMetadata.author, "Fotógrafo");
    assert.equal(saves.length, shouldSave ? 1 : 0);
    assert.equal(alerts.length, shouldSave ? 0 : 1);
    if (!shouldSave) {
      assert.match(
        alerts[0][1],
        /O HEIF gerado não passou na validação dos Estilos Fotográficos/,
        "the save alert exposes the conversion failure needed for diagnosis",
      );
    }
    assert.equal(
      catalogWrites.length,
      0,
      "neither Styles mode rewrites the finished HEIF",
    );
    assert.ok(deleted.includes("file:///styles.heic"));
    assert.deepEqual(
      conversions,
      [],
      "Styles preparation performs a single native P3 encode",
    );
    assert.deepEqual(
      expoDeleted,
      [],
      "native temporary photos bypass Expo directory permissions",
    );
    hooks.dispose();
  });
}

for (const captureMode of ["live", "portrait"]) {
  test(`${captureMode} uses the correct Styles policy at save time`, async () => {
    const hooks = createHooks();
    const calls = [];
    const stills = [];
    const { default: useQueue } = loadModule("app/hooks/usePhotoProcessingQueue.js", {
      react: hooks.react,
      "react-native": {
        Alert: { alert: (...args) => assert.fail(JSON.stringify(args)) },
        AppState: { addEventListener: () => ({ remove() {} }) },
        DeviceEventEmitter: { addListener: () => ({ remove() {} }), emit() {} },
      },
      "expo-file-system/legacy": {},
      "../../modules/composition-scan": {},
      "../../modules/camera-raw-capture": { listHeifPlusJobs: async () => [] },
      "../../modules/camera-photographic-styles": {},
      "../../modules/camera-live-photo": {
        saveLivePhotoToLibrary: async (options) => { calls.push(options); return { localIdentifier: "live" }; },
      },
      "../../modules/camera-portrait-capture": {
        convertPhotoFormat: async ({ photoUri }) => photoUri,
        saveProcessedPortraitPhoto: async (options) => { calls.push(options); return { localIdentifier: "portrait" }; },
      },
      "../utils/cameraUtils": {
        applyExifDataToImage: async (uri) => uri,
        cropImageToInverseAspect: async () => "file:///inverse.jpg",
        copyExifFromImage: async (_, uri) => uri,
        saveToAlbum: async (_, uri) => { stills.push(uri); return { id: "still" }; },
      },
      "../utils/komorebiExifMetadata": { saveKomorebiAssetMetadata: async () => {} },
      "../utils/photoIntelligence": { applyPhotoIntelligenceToMetadata: () => ({}) },
      "../utils/projects": {},
      "../utils/photoCatalogMetadata": {
        writePhotoCatalogMetadata: async (uri) => uri,
        deleteCatalogTemporaryPhoto: async () => {},
      },
    });
    const queue = hooks.render(() => useQueue(true));
    await queue.handleProcessed("file:///effect.jpg", {
      captureMode,
      originalUri: "file:///original.heic",
      ...(captureMode === "live" ? { livePhotoMovieUri: "file:///paired.mov" } : { depthDataEmbedded: true }),
      // Simulate a Live Photo queued before styles were paused.
      doubleCaptureMode: captureMode === "live",
      saveOriginalWithoutEffects: captureMode === "live",
      outputFormat: "heif",
      preserveApplePhotographicStyles: true,
      photographicStyles3Enabled: true,
      cameraPosition: "front",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].preserveApplePhotographicStyles, captureMode === "live" ? undefined : true);
    assert.equal(calls[0].photographicStyles3Enabled, captureMode === "live" ? undefined : true);
    assert.equal(calls[0].cameraPosition, captureMode === "live" ? undefined : "front");
    assert.equal(calls[0].originalPhotoUri, "file:///original.heic");
    if (captureMode === "live") {
      assert.equal(calls[0].movieUri, "file:///paired.mov");
      assert.deepEqual(stills, ["file:///inverse.jpg", "file:///original.heic"]);
    }
    hooks.dispose();
  });
}

for (const rawMode of ["raw", "proRaw"]) {
  test(`HEIF+ snapshots Styles preferences when captured from ${rawMode}`, async () => {
    const jobs = [];
    const queued = [];
    const { takePicture } = loadModule("app/utils/cameraUtils.js", {
      "expo-file-system/legacy": {},
      "expo-location": {},
      "expo-media-library": {},
      "expo-image-manipulator": {},
      "react-native": {},
      "../../modules/camera-live-photo": {},
      "../../modules/camera-portrait-capture": {},
      "../../modules/camera-raw-capture": {
        toVisionCameraRawMode: (mode) => mode,
        listHeifPlusJobs: async () => [],
        enqueueHeifPlus: async (uri, options) => {
          jobs.push({ uri, ...options });
          return { id: "durable", ...options };
        },
      },
      "./lutStore": {},
      "./projects": {},
      "./komorebiExifMetadata": { buildKomorebiExifMetadata: () => ({ createdAt: "2026-10-05T12:00:00Z" }) },
      "./lutProcessor": {},
    });
    await takePicture({
      cameraRef: { current: { takePhoto: async () => ({ path: "/capture.dng" }) } },
      cameraReady: true,
      isProcessing: false,
      setIsProcessing() {},
      setProcessingData: (data) => queued.push(data),
      selectedLutId: "none",
      rawMode,
      heifPlus: { settings: { exposure: 0 }, rawPairEnabled: true },
      preserveApplePhotographicStyles: true,
      photographicStyles3Enabled: true,
      cameraPosition: "front",
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].uri, "file:///capture.dng");
    assert.equal(queued[0].heifPlusJob.preserveApplePhotographicStyles, true);
    assert.equal(queued[0].heifPlusJob.photographicStyles3Enabled, true);
    assert.equal(queued[0].heifPlusJob.cameraPosition, "front");
  });
}

test("ProRAW styles the processed companion while preserving the DNG", async () => {
  const hooks = createHooks();
  const stylesInputs = [], catalogInputs = [], pairs = [], cleaned = [];
  const { default: useQueue } = loadModule("app/hooks/usePhotoProcessingQueue.js", {
    react: hooks.react,
    "react-native": {
      Alert: { alert: (...args) => assert.fail(JSON.stringify(args)) },
      AppState: { addEventListener: () => ({ remove() {} }) },
      DeviceEventEmitter: { addListener: () => ({ remove() {} }), emit() {} },
    },
    "expo-file-system/legacy": { deleteAsync: async () => assert.fail("Styles cleanup must use native file permissions") },
    "../../modules/composition-scan": {},
    "../../modules/camera-live-photo": {},
    "../../modules/camera-raw-capture": {
      listHeifPlusJobs: async () => [],
      saveRawPhotoPair: async (...args) => { pairs.push(args); return { id: "pair" }; },
    },
    "../../modules/camera-photographic-styles": {
      makePhotoStylesCompatible: async (uri) => {
        stylesInputs.push(uri);
        return { photoUri: "file:///styles.heic", verified: true, styles3Verified: true };
      },
      deletePhotographicStylesTemporaryPhoto: async (uri) => cleaned.push(uri),
    },
    "../../modules/camera-portrait-capture": {},
    "../utils/cameraUtils": {},
    "../utils/komorebiExifMetadata": { saveKomorebiAssetMetadata: async () => {} },
    "../utils/photoIntelligence": { applyPhotoIntelligenceToMetadata: () => ({}) },
    "../utils/projects": {},
    "../utils/photoCatalogMetadata": {
      writePhotoCatalogMetadata: async (uri) => { catalogInputs.push(uri); return uri; },
      deleteCatalogTemporaryPhoto: async () => {},
    },
  });
  const queue = hooks.render(() => useQueue(true));
  await queue.handleProcessed("file:///original.dng", {
    captureMode: "raw",
    originalUri: "file:///original.dng",
    derivativeSourceUri: "file:///companion.heic",
    rawPairEnabled: true,
    outputFormat: "heif",
    preserveApplePhotographicStyles: true,
    photographicStyles3Enabled: true,
  });
  assert.deepEqual(stylesInputs, ["file:///companion.heic"]);
  assert.deepEqual(catalogInputs, ["file:///original.dng"]);
  assert.equal(pairs[0][0], "file:///original.dng");
  assert.equal(pairs[0][1], "file:///styles.heic");
  assert.deepEqual(cleaned, ["file:///styles.heic"]);
  hooks.dispose();
});
