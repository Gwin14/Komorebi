const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");

function cameraUtils(capturePortraitPhoto, effectInputs = []) {
  return loadModule("app/utils/cameraUtils.js", {
    "expo-file-system/legacy": {},
    "expo-location": { getForegroundPermissionsAsync: async () => ({ status: "denied" }) },
    "expo-media-library": {},
    "expo-image-manipulator": {
      SaveFormat: { JPEG: "jpeg" },
      manipulateAsync: async (uri) => ({ uri }),
    },
    "react-native": { Image: { getSize: (_, ready) => ready(3000, 4000) } },
    "../../modules/camera-live-photo": {},
    "../../modules/camera-portrait-capture": { capturePortraitPhoto },
    "../../modules/camera-raw-capture": { toVisionCameraRawMode: () => "off" },
    "./lutStore": {},
    "./projects": {},
    "./komorebiExifMetadata": { buildKomorebiExifMetadata: () => ({}) },
    "./lutProcessor": {
      applyLUTToImage: async (uri) => {
        effectInputs.push(uri);
        return { needsProcessing: true, imageUri: uri, cube: [1] };
      },
    },
  });
}

for (const selectedLutId of ["none", "lut"]) {
  test(`portrait processes the blurred image and keeps sensor original (${selectedLutId})`, async () => {
    const captures = [], jobs = [], effects = [];
    const { takePicture } = cameraUtils(async (options) => {
      captures.push(options);
      return {
        photoUri: "file:///blur.heic",
        originalPhotoUri: "file:///sensor.heic",
        depthDataEmbedded: true,
      };
    }, effects);
    await takePicture({
      cameraRef: { current: null },
      cameraReady: true,
      hasMediaPermission: true,
      setIsProcessing: () => {},
      setProcessingData: (job) => jobs.push(job),
      portraitModeEnabled: true,
      portraitDeviceId: "dual-camera",
      portraitAperture: 2.8,
      selectedLutId,
      lutsLoaded: true,
      aspectRatio: 3 / 4,
      outputFormat: "heif",
    });
    assert.equal(captures[0].aperture, 2.8);
    assert.equal(jobs[0].originalUri, "file:///sensor.heic");
    assert.equal(jobs[0].imageUri, "file:///blur.heic");
    assert.equal(jobs[0].depthDataEmbedded, true);
    assert.deepEqual(effects, selectedLutId === "none" ? [] : ["file:///blur.heic"]);
  });
}

test("missing native depth propagates to the camera notice without enqueueing a flat photo", async () => {
  const failure = new Error("missing depth");
  const processingStates = [];
  const { takePicture } = cameraUtils(async () => { throw failure; });
  await assert.rejects(takePicture({
    cameraRef: { current: null },
    cameraReady: true,
    hasMediaPermission: true,
    setIsProcessing: (value) => processingStates.push(value),
    setProcessingData: () => assert.fail("No portrait should be queued"),
    portraitModeEnabled: true,
    portraitDeviceId: "dual-camera",
  }), failure);
  assert.deepEqual(processingStates, [true, false]);
});
