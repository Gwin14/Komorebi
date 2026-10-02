const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HEIF_PLUS_CONTROLS, DEFAULT_HEIF_PLUS_SETTINGS, restorePhotoFormat, normalizeHeifPlusSettings, getHeifPlusPolicy } = require('./heifPlusSettings');
const { completeHeifPlusJob } = require('./heifPlusJobs');

test('format migration retains legacy HEIF/JPEG choices and explicit HEIF+', () => {
  assert.equal(restorePhotoFormat(null, false), 'heif');
  assert.equal(restorePhotoFormat(null, true), 'jpeg');
  assert.equal(restorePhotoFormat('heifPlus', true), 'heifPlus');
  assert.equal(restorePhotoFormat('broken', true), 'jpeg');
});
test('RAW settings retain calibration and normalize corrupt/out-of-range inputs', () => {
  const defaults = normalizeHeifPlusSettings(null);
  assert.equal(defaults.sharpnessAmount, 0.15);
  assert.equal(defaults.luminanceNoiseReductionAmount, 0.15);
  assert.equal(defaults.contrastAmount, 0.05);
  assert.equal(defaults.localToneMapAmount, 0.15);
  assert.equal(defaults.exposure, 0);
  assert.equal(defaults.neutralTemperature, null);
  assert.equal(defaults.highlightRecoveryEnabled, true);
  const settings = normalizeHeifPlusSettings({ sharpnessAmount: 4, exposure: -9,
    neutralTemperature: 0, neutralTint: NaN, contrastAmount: '1', unexpected: 1 });
  assert.equal(settings.sharpnessAmount, 1);
  assert.equal(settings.exposure, -3);
  assert.equal(settings.neutralTemperature, 2000);
  assert.equal(settings.neutralTint, null);
  assert.equal(settings.contrastAmount, 0.05);
  assert.equal(settings.unexpected, undefined);
});
test('HEIF+ honors selected RAW and prefers ProRAW then Bayer from actual capabilities', () => {
  const base = { photoFormat: 'heifPlus', capabilities: { supportedModes: ['off', 'raw', 'proRaw'] } };
  assert.equal(getHeifPlusPolicy(base).rawMode, 'proRaw');
  assert.equal(getHeifPlusPolicy({ ...base, rawMode: 'raw' }).rawMode, 'raw');
  assert.equal(getHeifPlusPolicy({ ...base, capabilities: { supportedModes: ['off', 'raw'] } }).rawMode, 'raw');
  assert.equal(getHeifPlusPolicy({ photoFormat: 'heifPlus' }).effective, false);
});
test('incompatible modes suspend HEIF+ without changing the preference', () => {
  const base = { photoFormat: 'heifPlus', capabilities: { supportedModes: ['off', 'proRaw'] } };
  for (const key of ['livePhotoEnabled', 'portraitModeEnabled', 'stackingEnabled']) {
    const policy = getHeifPlusPolicy({ ...base, [key]: true });
    assert.equal(policy.requested, true);
    assert.equal(policy.effective, false);
    assert.equal(policy.rawMode, 'off');
    assert.ok(policy.suspensionReason);
  }
  assert.equal(getHeifPlusPolicy(base).effective, true);
  assert.equal(getHeifPlusPolicy({ ...base, platform: 'android' }).effective, false);
});
test('HEIF+ retains originals after export, enrichment, save or checkpoint failure', async () => {
  for (const failAt of ['render', 'onRendered', 'save', 'onSaved']) {
    const events = [];
    const operations = Object.fromEntries(['render', 'onRendered', 'save', 'onSaved', 'discard'].map(name => [name, async () => {
      events.push(name);
      if (name === failAt) throw new Error(name);
      return { id: 'job', state: 'rendered', variants: [] };
    }]));
    await assert.rejects(completeHeifPlusJob({ id: 'job', state: 'pending' }, operations));
    assert.equal(events.includes('discard'), false);
  }
});
test('resuming committed jobs does not export or save another Photos asset', async () => {
  const events = [];
  const job = { id: 'job', state: 'saved', variants: [{ assetId: 'photo' }] };
  const result = await completeHeifPlusJob(job, {
    render: async () => assert.fail('already rendered'),
    save: async () => assert.fail('already committed'),
    onRendered: async () => assert.fail('already enriched'),
    onSaved: async value => { assert.equal(value, job); events.push('metadata'); },
    discard: async id => { assert.equal(id, 'job'); events.push('cleanup'); },
  });
  assert.equal(result, job);
  assert.deepEqual(events, ['metadata', 'cleanup']);
});

test('custom HEIF+ settings preserve automatic values, manual values and disabled toggles after storage restoration', () => {
  const customized = normalizeHeifPlusSettings({ exposure: null, sharpnessAmount: 0.72,
    neutralTemperature: 8200, neutralTint: -12, highlightRecoveryEnabled: false,
    lensCorrectionEnabled: false });
  const restored = normalizeHeifPlusSettings(JSON.parse(JSON.stringify(customized)));
  assert.deepEqual(restored, customized);
});

test('untouched legacy profile upgrades to the soft profile without replacing custom choices', () => {
  const legacy = { ...Object.fromEntries(HEIF_PLUS_CONTROLS.map(([key]) => [key, null])),
    exposure: 0, highlightRecoveryEnabled: true, lensCorrectionEnabled: null };
  assert.deepEqual(normalizeHeifPlusSettings(legacy), DEFAULT_HEIF_PLUS_SETTINGS);
  assert.equal(normalizeHeifPlusSettings({ ...legacy, exposure: 0.5 }).sharpnessAmount, null);
  assert.deepEqual(normalizeHeifPlusSettings(DEFAULT_HEIF_PLUS_SETTINGS), DEFAULT_HEIF_PLUS_SETTINGS);
});
