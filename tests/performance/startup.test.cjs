const test = require("node:test");
const assert = require("node:assert/strict");
const { createHooks } = require("../helpers/hooks.cjs");
const { loadModule } = require("../helpers/loadModule.cjs");

function handoffHarness(t) {
  const hooks = createHooks();
  const frames = new Map();
  let nextId = 0;
  let hides = 0;
  const originalRequest = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = (callback) => {
    frames.set(++nextId, callback);
    return nextId;
  };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  t.after(() => {
    hooks.dispose();
    global.requestAnimationFrame = originalRequest;
    global.cancelAnimationFrame = originalCancel;
  });
  const useHandoff = loadModule("app/hooks/useNativeSplashHandoff.js", {
    react: hooks.react,
    "expo-splash-screen": {
      hideAsync: async () => { hides++; },
    },
  }).default;
  return {
    render: (props) => hooks.render(() => useHandoff(props)),
    frame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    hides: () => hides,
    pending: () => frames.size,
    dispose: () => hooks.dispose(),
  };
}

test("launch screen covers default settings until the saved layout has committed", (t) => {
  const h = handoffHarness(t);
  h.render({ loading: true, layoutReady: true });
  h.frame();
  assert.equal(h.hides(), 0);
  assert.equal(h.pending(), 0);
  h.render({ loading: false, layoutReady: false });
  h.frame();
  assert.equal(h.hides(), 0);
  h.render({ loading: false, layoutReady: true });
  h.frame();
  assert.equal(h.hides(), 0);
  h.frame();
  assert.equal(h.hides(), 1);
  // Ordinary screen re-renders must not schedule another handoff.
  h.render({ loading: false, layoutReady: true });
  h.frame();
  assert.equal(h.hides(), 1);
});

test("a pending launch handoff is cancelled if its layout becomes unavailable", (t) => {
  const h = handoffHarness(t);
  h.render({ loading: false, layoutReady: true });
  h.frame();
  h.render({ loading: false, layoutReady: false });
  h.frame();
  assert.equal(h.hides(), 0);
  assert.equal(h.pending(), 0);
  h.render({ loading: false, layoutReady: true });
  h.dispose();
  h.frame();
  assert.equal(h.hides(), 0);
});

const { flush, deferred } = require("../helpers/hooks.cjs");

test("camera settings are available while slow album maintenance is still pending", async (t) => {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  const albums = deferred();
  let saved;
  const { SettingsProvider, DEFAULT_SETTINGS } = loadModule("app/context/SettingsContext.js", {
    react: {
      ...hooks.react,
      createContext: () => ({ Provider: "SettingsProvider" }),
      useContext: () => null,
    },
    "../utils/settingsStorage": {
      loadStoredSettings: async () => saved,
      saveStoredSetting: async () => {},
      SETTINGS_STORAGE_KEYS: {},
    },
    "../utils/topBarControls": { getDefaultTopBarControls: () => ["settings"] },
    "../utils/projects": { reconcileProjectsWithAlbums: () => albums.promise },
  });
  saved = {
    ...DEFAULT_SETTINGS,
    firstTime: false,
    retroStyle: true,
    topBarBelow: true,
    projects: [{ id: "old", name: "Original" }],
    activeProjectId: "old",
  };
  const render = () => hooks.render(() => SettingsProvider({ children: null })).props.value;
  assert.equal(render().loading, true);
  await flush();
  const settings = render();
  assert.equal(settings.loading, false);
  assert.equal(settings.firstTime, false);
  assert.equal(settings.retroStyle, true);
  assert.equal(settings.topBarBelow, true);
  // A late result from maintenance must not overwrite user edits.
  const editedProjects = [{ id: "new", name: "Novo" }];
  settings.setProjects(editedProjects);
  settings.setActiveProjectId("new");
  albums.resolve([]);
  await flush();
  const updated = render();
  assert.equal(updated.projects, editedProjects);
  assert.equal(updated.activeProjectId, "new");
});

test("viewfinder remains opaque beneath its startup mask while controls can fade", () => {
  const progress = { interpolate: () => 1 };
  const startup = { loading: true, progress, pulse: 0.6, complete: false };
  const Controls = loadModule("app/components/CameraStartupControls.jsx", {
    react: {},
    "react-native": {
      View: "NativeView",
      Animated: { View: "AnimatedView", multiply: (a, b) => a * b },
      StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
    },
  }).default;
  const viewfinder = Controls({ startup, kind: "viewfinder", children: "Camera" });
  const [preview, mask] = viewfinder.props.children;
  assert.equal(preview.type, "NativeView");
  assert.equal(preview.props.style, undefined);
  assert.equal(mask.props.style[1].opacity, 1);
  // Missing camera-ready events must not leave an opaque mask over live frames.
  const restored = Controls({
    startup: { ...startup, loading: false },
    kind: "viewfinder",
    children: "Camera",
  });
  assert.equal(restored.props.children[1], false);
  assert.equal(restored.props.children[0].props.pointerEvents, "none");
  const topBar = Controls({ startup, kind: "top", children: "TopBar" });
  assert.equal(topBar.props.children[0].type, "AnimatedView");
  assert.equal(topBar.props.children[0].props.style.opacity, progress);
});

test("camera permission is available while photo and location queries are pending or fail", async (t) => {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  const media = deferred();
  const location = deferred();
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => { console.error = originalError; });
  const useBootstrap = loadModule("app/hooks/useCameraBootstrap.js", {
    react: hooks.react,
    "react-native": {
      AppState: { addEventListener: () => ({ remove() {} }) },
      Linking: { openSettings: async () => {} },
    },
    "react-native-vision-camera": {
      Camera: { getCameraPermissionStatus: () => "granted" },
    },
    "expo-media-library": { getPermissionsAsync: () => media.promise },
    "expo-location": { getForegroundPermissionsAsync: () => location.promise },
    "../utils/lutProcessor": {
      loadAllLUTs: async () => {},
      loadCustomLUTs: async () => {},
    },
  }).default;
  const customLuts = [];
  const render = () => hooks.render(() => useBootstrap({ customLuts }));
  render();
  await flush();
  const pending = render();
  assert.equal(pending.cameraPermission, "granted");
  assert.equal(pending.mediaPermission, null);
  assert.equal(pending.locationPermission, null);
  media.reject(new Error("Synthetic library failure"));
  location.resolve({ status: "denied", granted: false });
  await flush();
  const settled = render();
  assert.equal(settled.cameraPermission, "granted");
  assert.equal(settled.locationPermission.status, "denied");
  assert.equal(errors.length, 1);
});
