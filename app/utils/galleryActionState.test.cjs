const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { togglePhotoSelection, retainPhotoSelection, runSequentialPhotoAction, withGalleryAssets } = loadModule("app/utils/galleryActionState.js");

test("selection remains stable through reorder and pagination; removes deleted IDs", () => {
  const original = new Set(["a"]);
  const selected = togglePhotoSelection(original, "b");
  assert.deepEqual([...original], ["a"]);
  assert.deepEqual([...retainPhotoSelection(selected, [{ id: "b" }, { id: "c" }, { id: "a" }])], ["a", "b"]);
  assert.deepEqual([...retainPhotoSelection(selected, [{ id: "b" }])], ["b"]);
  assert.deepEqual([...togglePhotoSelection(selected, "a")], ["b"]);
});

test("sequential actions record partial failures and stop between assets on cancellation", async () => {
  let cancelled = false;
  const visited = [];
  const progress = [];
  const result = await runSequentialPhotoAction(["a", "b", "b", "c", "d"], async (id) => {
    visited.push(id);
    if (id === "b") throw new Error("denied");
    if (id === "c") cancelled = true;
  }, { isCancelled: () => cancelled, onProgress: (value) => progress.push(value) });
  assert.deepEqual(visited, ["a", "b", "c"]);
  assert.deepEqual(result.succeeded, ["a", "c"]);
  assert.deepEqual(result.failed.map((item) => item.id), ["b"]);
  assert.deepEqual(result.pending, ["d"]);
  assert.deepEqual(progress.at(-1), { completed: 3, total: 4 });
});

test("asset locks reject overlap and release after an error", async () => {
  let release;
  const running = withGalleryAssets(["a"], () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(withGalleryAssets(["b", "a"], async () => {}), /andamento/);
  await withGalleryAssets(["b"], async () => {});
  release();
  await running;
  await assert.rejects(withGalleryAssets(["a"], async () => { throw new Error("failed"); }), /failed/);
  await withGalleryAssets(["a"], async () => {});
});
