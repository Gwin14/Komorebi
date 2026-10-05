const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('../helpers/loadModule.cjs');
const { createHooks, flush, deferred } = require('../helpers/hooks.cjs');

test('camera activity follows navigation, lock/background and resume, and removes its listener', () => {
  const hooks = createHooks();
  let focused = true;
  const listeners = new Set();
  const state = { currentState: 'active', addEventListener: (_, fn) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) };
  } };
  const useActivity = loadModule('app/hooks/useCameraActivity.js', {
    react: hooks.react, '@react-navigation/native': { useIsFocused: () => focused },
    'react-native': { AppState: state },
  }).default;
  const render = () => hooks.render(useActivity);
  assert.equal(render(), true);
  focused = false; assert.equal(render(), false);
  focused = true; assert.equal(render(), true);
  for (const value of ['inactive', 'background', 'active']) {
    state.currentState = value; for (const fn of listeners) fn(value);
    assert.equal(render(), value === 'active');
  }
  hooks.dispose(); assert.equal(listeners.size, 0);
});

function processorFixture(read, save) {
  const hooks = createHooks();
  const injected = [];
  const completed = [];
  const errors = [];
  const Processor = loadModule('app/utils/lutProcessorComponent.js', {
    react: hooks.react, 'react-native-webview': { WebView: 'WebView' },
    'expo-file-system/legacy': { EncodingType: { Base64: 'base64' }, readAsStringAsync: read },
    piexifjs: { load: () => ({ Exif: { source: 'test' } }) },
    './exifImageWriter': { saveProcessedImage: save },
    './lutProcessingHtml': { generateRuntimeHTML: () => '<html />' },
  }).LUTProcessor;
  const render = (imageData) => hooks.render(() => Processor({ imageData,
    onProcessed: (...args) => completed.push(args), onError: (error) => errors.push(error) }));
  const initial = render(null);
  initial.props.ref.current = { injectJavaScript: (js) => injected.push(js) };
  initial.props.onLoadEnd();
  return { render, injected, completed, errors, hooks };
}

test('processor reuses identical EXIF source and accepts one completion despite duplicate messages/renders', async () => {
  let reads = 0, saves = 0;
  const saving = deferred();
  const f = processorFixture(async () => { reads++; return 'pixels'; }, async () => { saves++; return saving.promise; });
  const data = { needsProcessing: true, imageUri: 'file://a.jpg', originalUri: 'file://a.jpg' };
  const view = f.render(data); await flush();
  assert.equal(reads, 1);
  assert.equal(f.injected.length, 1);
  const event = { nativeEvent: { data: JSON.stringify({ requestId: 1, type: 'success', data: 'result' }) } };
  const first = view.props.onMessage(event);
  await view.props.onMessage(event);
  assert.equal(saves, 1);
  saving.resolve('file://saved.jpg'); await first;
  f.render(data); await flush();
  assert.equal(f.injected.length, 1);
  assert.equal(f.completed.length, 1);
  assert.equal(f.completed[0][1], data);
  f.hooks.dispose();
});

test('unmount during file I/O prevents EXIF work, bridge injection and callbacks', async () => {
  const reading = deferred();
  let reads = 0;
  const f = processorFixture(() => { reads++; return reading.promise; }, async () => 'saved');
  f.render({ needsProcessing: true, imageUri: 'a', originalUri: 'b' });
  f.hooks.dispose(); reading.resolve('pixels'); await flush();
  assert.equal(reads, 1);
  assert.equal(f.injected.length, 0);
  assert.equal(f.completed.length, 0);
  assert.equal(f.errors.length, 0);
});

test('replacement request rejects late file data from the previous photo', async () => {
  const reading = deferred();
  const f = processorFixture((uri) => uri === 'old' ? reading.promise : Promise.resolve('new'), async () => 'saved');
  f.render({ needsProcessing: true, imageUri: 'old' });
  f.render({ needsProcessing: true, imageUri: 'new' }); await flush();
  reading.resolve('old pixels'); await flush();
  assert.equal(f.injected.length, 1);
  assert.match(f.injected[0], /"requestId":2/);
  f.hooks.dispose();
});

test('failure while saving an old result cannot cancel a newer request', async () => {
  const saving = deferred();
  const f = processorFixture(async () => 'pixels', () => saving.promise);
  const oldView = f.render({ needsProcessing: true, imageUri: 'old' }); await flush();
  const oldSave = oldView.props.onMessage({ nativeEvent: { data: JSON.stringify({ requestId: 1, type: 'success', data: 'old' }) } });
  const newView = f.render({ needsProcessing: true, imageUri: 'new' }); await flush();
  saving.reject(new Error('old disk write failed')); await oldSave;
  assert.equal(f.errors.length, 0);
  await newView.props.onMessage({ nativeEvent: { data: JSON.stringify({ requestId: 2, type: 'error', message: 'new failure' }) } });
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].message, 'new failure');
  f.hooks.dispose();
});

test('orientation preserves all rotations and avoids shared-value writes for repeated sensor samples', () => {
  const hooks = createHooks();
  let focused = true, listener = null, writes = 0, value = '0deg';
  const rotation = { get value() { return value; }, set value(next) { value = next; writes++; } };
  const orientation = loadModule('app/hooks/useDeviceOrientation.js', {
    react: hooks.react,
    '@react-navigation/native': { useIsFocused: () => focused },
    '../utils/deviceMotion': { subscribeDeviceMotion: (fn, interval) => {
      assert.equal(interval, 200); listener = fn;
      return () => { listener = null; };
    } },
    'react-native-reanimated': { useSharedValue: () => rotation, useAnimatedStyle: () => ({}), withTiming: (next) => next },
  }).useDeviceOrientationState;
  const render = () => hooks.render(orientation);
  render();
  for (const [input, output] of [[90, -90], [-90, 90], [270, 90], [180, 180], [-180, 180], [0, 0]]) {
    listener({ orientation: input });
    const before = writes;
    for (let i = 0; i < 20; i++) listener({ orientation: input });
    assert.equal(writes, before);
    assert.equal(render().orientation, output);
    assert.equal(value, `${output}deg`);
  }
  listener({ orientation: 123 }); assert.equal(render().orientation, 0);
  focused = false; render(); assert.equal(listener, null);
  focused = true; render(); assert.equal(typeof listener, 'function');
  hooks.dispose(); assert.equal(listener, null);
});
