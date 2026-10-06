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

test("4:3 preview prefers the uncropped stream over a larger widescreen stream", () => {
  const fullFrame = { photoWidth: 4032, photoHeight: 3024, videoWidth: 1440, videoHeight: 1080 };
  const widescreen = { ...fullFrame, videoWidth: 3840, videoHeight: 2160 };
  for (const frameProcessorActive of [false, true]) {
    assert.equal(
      cameraExports.getCameraFormat(
        { id: "back", formats: [widescreen, fullFrame] },
        getCameraFormatFilters({ sensorAspectRatio: 4 / 3, frameProcessorActive }),
      ),
      fullFrame,
    );
  }
});

const aspectExports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(require.resolve("./aspectRatios.js"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: aspectExports },
);

test("preview fits above the controls without clipping or changing its ratio", () => {
  for (const retroStyle of [false, true]) {
    for (const aspectRatio of ["4:3", "16:9", "1:1"]) {
      for (const availableHeight of [320, 700]) {
        const { width, height } = aspectExports.getPreviewDimensions({
          screenWidth: 393, availableHeight, retroStyle, aspectRatio,
        });
        if (aspectRatio === "4:3" && !retroStyle) {
          assert.equal(width, 393);
          assert.equal(height, 524);
        } else {
          assert.ok(height <= availableHeight);
          assert.ok(width <= 393 * (retroStyle ? 0.9 : 1));
        }
        assert.ok(Math.abs(width / height - aspectExports.getAspectRatioValue(aspectRatio)) < 1e-10);
      }
    }
  }
});

test("retro viewfinder retains its 90 percent width when space is available", () => {
  const { width, height } = aspectExports.getPreviewDimensions({
    screenWidth: 400, availableHeight: 700, retroStyle: true, aspectRatio: "4:3",
  });
  assert.equal(width, 360);
  assert.equal(height, 480);
});

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
