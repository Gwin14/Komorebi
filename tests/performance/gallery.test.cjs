const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/loadModule.cjs');
const { deferred, flush } = require('../helpers/hooks.cjs');

function fixture(info, rating = async () => 3) {
  let queries = 0;
  const photos = Array.from({ length: 100 }, (_, id) => ({ id: String(id), uri: `ph://${id}`, creationTime: id }));
  const { loadGalleryPhotos } = loadModule('app/utils/galleryPhotos.js', {
    'expo-media-library': {
      getAlbumsAsync: async () => [{ title: 'Komorebi' }, { title: 'project' }],
      getAssetsAsync: async ({ album, first }) => { queries++; assert.equal(first, 100); return { assets: album.title === 'project' ? [] : photos }; },
      getAssetInfoAsync: info, SortBy: { creationTime: 'creationTime' },
    },
    './projects': { DEFAULT_ALBUM_NAME: 'Komorebi', getProjectAlbumName: (project) => project.name },
    './photoCatalogMetadata': { readPhotoRating: rating },
  });
  return { loadGalleryPhotos, photos, get queries() { return queries; } };
}

test('superseded gallery load stops at its in-flight batch and does not read ratings', async () => {
  const pending = deferred(); let infoReads = 0, ratings = 0, current = true;
  const f = fixture(() => { infoReads++; return pending.promise; }, async () => { ratings++; return 4; });
  const result = f.loadGalleryPhotos(null, () => current); await flush();
  assert.equal(infoReads, 4);
  current = false; pending.resolve({ localUri: 'file://old' });
  assert.equal(await result, null);
  assert.equal(infoReads, 4);
  assert.equal(ratings, 0);
  assert.deepEqual(await f.loadGalleryPhotos({ name: 'project' }, () => true), []);
});

test('current gallery preserves all photos and ratings with at most four concurrent native reads', async () => {
  let active = 0, maximum = 0;
  const f = fixture(async (id) => { active++; maximum = Math.max(maximum, active); await flush(); active--; return { localUri: `file://${id}` }; });
  const result = await f.loadGalleryPhotos(null, () => true);
  assert.equal(result.length, 100);
  assert.equal(maximum, 4);
  assert.deepEqual(result[99], { id: '99', uri: 'file://99', creationTime: 99, rating: 3 });
});

test('cancel before album lookup completes avoids the asset query; missing album returns empty', async () => {
  const f = fixture(async () => ({}));
  assert.equal(await f.loadGalleryPhotos(null, () => false), null);
  assert.equal(f.queries, 0);
  assert.deepEqual(await f.loadGalleryPhotos({ name: 'missing' }, () => true), []);
  assert.equal(f.queries, 0);
});
