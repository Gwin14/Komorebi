const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");

function fixture({ platform = "ios", exportPhoto, share, info, rate } = {}) {
  const calls = [];
  const actions = loadModule("app/utils/galleryActions.js", {
    "react-native": { Platform: { OS: platform } },
    "react-native-share": { open: async (options) => { calls.push(["share", options]); await share?.(options); } },
    "expo-file-system/legacy": {
      cacheDirectory: "file:///cache/",
      makeDirectoryAsync: async (uri) => calls.push(["mkdir", uri]),
      copyAsync: async (options) => calls.push(["copy", options]),
      deleteAsync: async (uri) => calls.push(["cleanup", uri]),
    },
    "expo-media-library": { getAssetInfoAsync: info || (async (id) => ({ localUri: `file:///${id}.jpg`, filename: `${id}.jpg` })) },
    "../../modules/camera-photo-depth": { exportCurrentPhoto: exportPhoto || (async (id, destination) => `${destination}.heic`) },
    "./photoCatalogMetadata": { savePhotoRating: rate || (async () => {}) },
  });
  return { ...actions, calls };
}

test("shares all current files in one native sheet and cleans up after it resolves", async () => {
  const f = fixture();
  await f.shareGalleryPhotos(["a", "b"]);
  const sheet = f.calls.find(([kind]) => kind === "share")[1];
  assert.equal(sheet.urls.length, 2);
  assert.equal(sheet.failOnCancel, false);
  assert.equal(f.calls.at(-1)[0], "cleanup");
});

test("a preparation failure never opens a partial share sheet and cleans up", async () => {
  const f = fixture({ exportPhoto: async (id) => { if (id === "b") throw new Error("iCloud unavailable"); return "file:///a.heic"; } });
  await assert.rejects(f.shareGalleryPhotos(["a", "b"]), /iCloud/);
  assert.equal(f.calls.some(([kind]) => kind === "share"), false);
  assert.equal(f.calls.at(-1)[0], "cleanup");
});

test("cancelling preparation prevents the sheet; Android copies content URIs to files", async () => {
  const f = fixture({ platform: "android", info: async () => ({ uri: "content://photos/a", filename: "a.jpg" }) });
  let cancelled = false;
  await f.shareGalleryPhotos(["a", "b"], { isCancelled: () => cancelled, onProgress: () => { cancelled = true; } });
  assert.equal(f.calls.filter(([kind]) => kind === "copy").length, 1);
  assert.equal(f.calls.some(([kind]) => kind === "share"), false);
  assert.equal(f.calls.at(-1)[0], "cleanup");
});

test("rating is confirmed even if refreshing its preview fails", async () => {
  const saved = [];
  const f = fixture({ info: async () => { throw new Error("preview missing"); } });
  const result = await f.rateGalleryPhotos(["a"], 4, { onSaved: (...args) => saved.push(args) });
  assert.deepEqual(result.succeeded, ["a"]);
  assert.deepEqual(saved, [["a", 4, undefined]]);
});
