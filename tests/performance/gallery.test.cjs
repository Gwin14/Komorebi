const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../helpers/loadModule.cjs");
const { deferred, flush } = require("../helpers/hooks.cjs");

function fixture(info, rating = async () => 3) {
  let queries = 0;
  const photos = Array.from({ length: 100 }, (_, id) => ({
    id: String(id),
    uri: `ph://${id}`,
    creationTime: id,
  }));
  const { loadGalleryPhotos } = loadModule("app/utils/galleryPhotos.js", {
    "expo-media-library": {
      getAlbumsAsync: async () => [{ title: "Komorebi" }, { title: "project" }],
      getAssetsAsync: async ({ album, first }) => {
        queries++;
        assert.equal(first, 100);
        return { assets: album.title === "project" ? [] : photos };
      },
      getAssetInfoAsync: (id, options) => {
        assert.deepEqual(options, { shouldDownloadFromNetwork: false });
        return info(id, options);
      },
      SortBy: { creationTime: "creationTime" },
    },
    "./projects": {
      DEFAULT_ALBUM_NAME: "Komorebi",
      getProjectAlbumName: (project) => project.name,
    },
    "./photoCatalogMetadata": { readPhotoRating: rating },
  });
  return {
    loadGalleryPhotos,
    photos,
    get queries() {
      return queries;
    },
  };
}

test("superseded gallery load stops at its in-flight batch and does not read ratings", async () => {
  const pending = deferred();
  let infoReads = 0,
    ratings = 0,
    current = true;
  const f = fixture(
    () => {
      infoReads++;
      return pending.promise;
    },
    async () => {
      ratings++;
      return 4;
    },
  );
  const result = f.loadGalleryPhotos(null, () => current);
  await flush();
  assert.equal(infoReads, 4);
  current = false;
  pending.resolve({ localUri: "file://old" });
  assert.equal(await result, null);
  assert.equal(infoReads, 4);
  assert.equal(ratings, 0);
  assert.deepEqual(
    await f.loadGalleryPhotos({ name: "project" }, () => true),
    [],
  );
});

test("current gallery preserves all photos and ratings with at most four concurrent native reads", async () => {
  let active = 0,
    maximum = 0;
  const f = fixture(async (id) => {
    active++;
    maximum = Math.max(maximum, active);
    await flush();
    active--;
    return { localUri: `file://${id}` };
  });
  const result = await f.loadGalleryPhotos(null, () => true);
  assert.equal(result.length, 100);
  assert.equal(maximum, 4);
  assert.deepEqual(result[99], {
    id: "99",
    uri: "file://99",
    creationTime: 99,
    rating: 3,
  });
});

test("cancel before album lookup completes avoids the asset query; missing album returns empty", async () => {
  const f = fixture(async () => ({}));
  assert.equal(await f.loadGalleryPhotos(null, () => false), null);
  assert.equal(f.queries, 0);
  assert.deepEqual(
    await f.loadGalleryPhotos({ name: "missing" }, () => true),
    [],
  );
  assert.equal(f.queries, 0);
});

test("gallery reads subsequent pages, deduplicates IDs and respects cancellation between pages", async () => {
  const queries = [];
  const { loadGalleryPhotos } = loadModule("app/utils/galleryPhotos.js", {
    "expo-media-library": {
      getAlbumsAsync: async () => [{ title: "Komorebi" }],
      getAssetsAsync: async (options) => {
        queries.push(options.after);
        return options.after ? {
          assets: [{ id: "a", uri: "file:///a.jpg", creationTime: 2 }, { id: "b", uri: "file:///b.jpg", creationTime: 1 }],
          hasNextPage: false,
        } : {
          assets: [{ id: "a", uri: "file:///a.jpg", creationTime: 2 }], hasNextPage: true, endCursor: "next",
        };
      },
      SortBy: { creationTime: "creationTime" },
    },
    "./projects": { DEFAULT_ALBUM_NAME: "Komorebi" },
    "./photoCatalogMetadata": { readPhotoRating: async () => 4 },
  });
  const result = await loadGalleryPhotos(null, () => true);
  assert.deepEqual(queries, [undefined, "next"]);
  assert.deepEqual(result.map((photo) => photo.id), ["a", "b"]);
  queries.length = 0;
  assert.equal(await loadGalleryPhotos(null, () => queries.length < 2), null);
});

test("unavailable previews retain asset IDs so failed batch actions can be retried", async () => {
  const f = fixture(async () => { throw new Error("offline"); });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await f.loadGalleryPhotos(null, () => true);
    assert.equal(result.length, 100);
    assert.deepEqual(result[0], { ...f.photos[0], rating: null });
  } finally {
    console.warn = warn;
  }
});
