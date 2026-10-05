const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/loadModule.cjs');

const cubeText = 'LUT_3D_SIZE 2\n' + Array.from({ length: 8 }, (_, i) => `${i & 1} ${(i >> 1) & 1} ${(i >> 2) & 1}`).join('\n');

test('concurrent LUT bootstraps read and parse each asset once; cached data remains usable', async () => {
  let reads = 0;
  const store = loadModule('app/utils/lutStore.js', {
    'expo-asset': { Asset: { fromModule: (id) => ({ localUri: id, downloadAsync: async () => {} }) } },
    'expo-file-system/legacy': { readAsStringAsync: async () => { reads++; return cubeText; } },
    './lutCatalog': { AVAILABLE_LUTS: [{ id: 'a', file: 1 }, { id: 'b', file: 2 }] },
  });
  await Promise.all([store.loadAllLUTs(), store.loadAllLUTs(), store.loadAllLUTs()]);
  assert.equal(reads, 2);
  assert.equal(store.getCachedLUT('a').lut.length, 8);
  await store.loadAllLUTs();
  assert.equal(reads, 2);
  await store.loadCustomLUTs([{ id: 'custom', content: cubeText }]);
  assert.equal(store.getCachedLUT('custom').size, 2);
  store.removeCustomLUT('custom');
  assert.equal(store.getCachedLUT('custom'), null);
});

test('a failed LUT read is retried on a later bootstrap', async () => {
  let reads = 0;
  const store = loadModule('app/utils/lutStore.js', {
    'expo-asset': { Asset: { fromModule: () => ({ localUri: 'a', downloadAsync: async () => {} }) } },
    'expo-file-system/legacy': { readAsStringAsync: async () => {
      if (++reads === 1) throw new Error('expected I/O failure');
      return cubeText;
    } },
    './lutCatalog': { AVAILABLE_LUTS: [{ id: 'a', file: 1 }] },
  });
  await store.loadAllLUTs();
  assert.equal(store.getCachedLUT('a'), null);
  await store.loadAllLUTs();
  assert.equal(store.getCachedLUT('a').size, 2);
  assert.equal(reads, 2);
});

test('settings use one batch and preserve legacy format, explicit false, text and structured data', async () => {
  let reads = 0;
  const data = {
    '@settings/saveAsJpeg': 'true', '@settings/gridVisible': 'false',
    '@settings/photoAuthor': 'Fábio', '@settings/photoCopyright': '',
    '@settings/projects': '[{"id":"p1","name":"Projeto"}]',
    '@settings/activeProjectId': 'p1', '@settings/customLuts': '[]',
  };
  const { loadStoredSettings, SETTINGS_STORAGE_KEYS } = loadModule('app/utils/settingsStorage.js', {
    '@react-native-async-storage/async-storage': { multiGet: async (keys) => {
      reads++; assert.equal(new Set(keys).size, Object.keys(SETTINGS_STORAGE_KEYS).length);
      return keys.map((key) => [key, data[key] ?? null]);
    } },
    'react-native': { Platform: { OS: 'ios' } },
  });
  const result = await loadStoredSettings({ gridVisible: true, levelVisible: true, photoCopyright: 'fallback' });
  assert.equal(reads, 1);
  assert.equal(result.photoFormat, 'jpeg');
  assert.equal(result.gridVisible, false);
  assert.equal(result.levelVisible, true);
  assert.equal(result.photoAuthor, 'Fábio');
  assert.equal(result.photoCopyright, '');
  assert.deepEqual(result.projects, [{ id: 'p1', name: 'Projeto' }]);
  assert.equal(result.activeProjectId, 'p1');
});
