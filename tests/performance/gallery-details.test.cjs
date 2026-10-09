const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../helpers/loadModule.cjs");
const { createHooks, deferred, flush } = require("../helpers/hooks.cjs");

function fixture() {
  const hooks = createHooks();
  let photos = Array.from({ length: 1000 }, (_, id) => ({ id: String(id), uri: `ph://${id}`, creationTime: id }));
  const calls = [], snapshots = [];
  const generation = { current: 1 };
  const setPhotos = (update) => { photos = update(photos); };
  const useDetails = loadModule("app/hooks/useGalleryPhotoDetails.js", {
    react: hooks.react,
    "../utils/galleryCache": { cacheGalleryPhotos: (_, value) => snapshots.push(value) },
    "../utils/galleryPhotos": {
      resolveGalleryPhotoDetails: async (pending, current, onBatch) => {
        const gate = deferred();
        calls.push({ ids: pending.map((photo) => photo.id), gate });
        await gate.promise;
        if (current()) onBatch(pending.map((photo) => ({ ...photo, rating: 4 })));
      },
    },
  }).default;
  return {
    hooks, calls, generation, snapshots,
    get photos() { return photos; },
    render: (props = {}) => hooks.render(() => useDetails({ photos, setPhotos, project: null, enabled: true, revision: 0, generation, selectedAssetId: null, ...props })),
  };
}

test("a thousand-photo library reads details only for visible rows, once per refresh", async () => {
  const f = fixture();
  const onViewable = f.render();
  assert.equal(f.calls.length, 0);
  onViewable({ viewableItems: [{ item: f.photos.slice(0, 4) }] });
  f.render();
  assert.deepEqual(f.calls[0].ids, ["0", "1", "2", "3"]);
  f.calls[0].gate.resolve();
  await flush();
  const callback = f.render();
  assert.equal(callback, onViewable);
  assert.equal(f.photos[0].rating, 4);
  assert.equal(f.photos[4].rating, undefined);
  callback({ viewableItems: [{ item: f.photos.slice(0, 4) }] });
  f.render();
  assert.equal(f.calls.length, 1);
  f.hooks.dispose();
});

test("a stale rating read cannot overwrite the next project or refresh", async () => {
  const f = fixture();
  f.render()({ viewableItems: [{ item: f.photos.slice(0, 4) }] });
  f.render();
  f.generation.current++;
  f.render({ revision: 1 });
  assert.equal(f.calls.length, 2);
  f.calls[0].gate.resolve();
  await flush();
  assert.equal(f.snapshots.length, 0);
  f.calls[1].gate.resolve();
  await flush();
  assert.equal(f.snapshots.length, 1);
  f.hooks.dispose();
});

test("the open photo resolves outside the viewport; unmount cancels publication", async () => {
  const f = fixture();
  f.render({ enabled: false, selectedAssetId: "999" });
  assert.equal(f.calls.length, 0);
  f.render({ selectedAssetId: "999" });
  assert.deepEqual(f.calls[0].ids, ["999"]);
  f.hooks.dispose();
  f.calls[0].gate.resolve();
  await flush();
  assert.equal(f.snapshots.length, 0);
});

test("section header and footer visibility never schedules photo metadata reads", () => {
  const f = fixture();
  const section = { key: "day", title: "Date", data: [f.photos.slice(0, 4)] };
  f.render()({ viewableItems: [{ item: section, index: null }, { item: section, index: null }] });
  f.render();
  assert.equal(f.calls.length, 0);
  f.hooks.dispose();
});
