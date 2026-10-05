const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { getCameraFormatFilters } = require("./cameraFormatFilters");
const { getHeifPlusPolicy } = require("./heifPlusSettings");

// Exercise the installed VisionCamera selector with the two formats in the log.
const source = fs.readFileSync(
  require.resolve("react-native-vision-camera/src/devices/getCameraFormat.ts"),
  "utf8",
);
const cameraExports = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports: cameraExports,
    require: () => ({ CameraRuntimeError: Error }),
  },
);
const formats = [
  { photoWidth: 4032, photoHeight: 3024, videoWidth: 3264, videoHeight: 2448 },
  { photoWidth: 8064, photoHeight: 6048, videoWidth: 4032, videoHeight: 3024 },
];
const device = { id: "back", formats };
const rawFormat = formats[1];
const select = (options) =>
  cameraExports.getCameraFormat(device, getCameraFormatFilters(options));

test("RAW retains the supporting session format with manual controls, effects and every crop", () => {
  for (const sensorAspectRatio of [4 / 3, 16 / 9, 1]) {
    for (const manualPhotoMode of [false, true]) {
      for (const frameProcessorActive of [false, true]) {
        assert.equal(
          select({
            sensorAspectRatio,
            manualPhotoMode,
            frameProcessorActive,
            rawPhotoMode: true,
          }),
          rawFormat,
        );
      }
    }
  }
});

test("HEIF+ stabilizes after receiving capabilities instead of alternating session formats", () => {
  let activeFormat = rawFormat;
  for (let i = 0; i < 6; i++) {
    const capabilities = {
      supportedModes: activeFormat === rawFormat ? ["off", "proRaw"] : ["off"],
    };
    const policy = getHeifPlusPolicy({ photoFormat: "heifPlus", capabilities });
    assert.equal(policy.effective, true);
    activeFormat = select({
      sensorAspectRatio: 4 / 3,
      rawPhotoMode: policy.effective,
    });
    assert.equal(activeFormat, rawFormat);
  }
});

test("processed manual capture keeps the lower resolution session format", () => {
  assert.equal(
    select({
      sensorAspectRatio: 4 / 3,
      rawPhotoMode: false,
      manualPhotoMode: true,
      frameProcessorActive: true,
    }),
    formats[0],
  );
});
