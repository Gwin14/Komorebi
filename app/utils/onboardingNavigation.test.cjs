const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks, flush } = require("../../tests/helpers/hooks.cjs");

function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function welcomeFixture(t, embedded = true) {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  const animations = [];
  const calls = [];
  const settings = { topBarControls: ["settings"], diagnosticsEnabled: true };
  for (const key of ["FirstTime", "GridVisible", "LevelVisible", "HistogramVisible", "TopBarBelow", "TopBarControls"])
    settings[`set${key}`] = value => calls.push([key, value]);
  const mocks = {
    react: hooks.react,
    "react-native": {
      View: "View", Modal: "Modal", Text: "Text", Image: "Image", Pressable: "Pressable", ScrollView: "ScrollView",
      Platform: { OS: "ios" },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
      Animated: {
        View: "AnimatedView", Value: class {}, timing: () => ({}),
        parallel: () => {
          const animation = { start: callback => { animation.complete = callback; }, stop() {} };
          animations.push(animation);
          return animation;
        },
      },
      Easing: { cubic: "cubic", in: value => value, out: value => value },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-web-browser": {},
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) },
    "../context/SettingsContext": { useSettings: () => settings },
    "./CustoToggle": { __esModule: true, default: "Toggle" },
    "./TopBarControlList": { __esModule: true, default: "Controls" },
    "./Welcome.styles": { __esModule: true, default: {} },
  };
  for (const name of ["ocean", "light", "bird", "motion", "palms"])
    mocks[`../../assets/images/onboarding/${name}.jpg`] = name;
  mocks["../../assets/images/app-icons/KomorebiLogo-iOS-Default-1024.png"] = "icon";
  const Welcome = loadModule("app/components/Welcome.jsx", mocks).default;
  const render = () => hooks.render(() => Welcome({ embedded, permissions: {}, onComplete: () => calls.push(["complete"]) }));
  const finish = () => {
    const pages = nodes(render()).filter(node => node.props?.accessibilityLabel?.startsWith("Ir para a etapa"));
    pages.at(-1).props.onPress();
    return nodes(render()).find(node => node.props?.accessibilityLabel === "Abrir a câmera").props.onPress;
  };
  return { render, finish, calls, animations, hooks };
}

test("replay renders inside its screen while first launch keeps its modal", t => {
  assert.equal(welcomeFixture(t).render().type, "View");
  assert.equal(welcomeFixture(t, false).render().type, "Modal");
});

test("an interrupted closing fade still saves choices and completes replay once", t => {
  const f = welcomeFixture(t);
  const finish = f.finish();
  finish();
  finish();
  f.animations.at(-1).complete({ finished: false });
  assert.equal(f.calls.filter(([name]) => name === "complete").length, 1);
  assert.deepEqual(f.calls.find(([name]) => name === "FirstTime"), ["FirstTime", false]);
  assert.ok(f.calls.some(([name]) => name === "TopBarControls"));
});

test("leaving the screen cancels stale completion instead of navigating again", t => {
  const f = welcomeFixture(t);
  f.finish()();
  f.hooks.dispose();
  f.animations.at(-1).complete({ finished: false });
  assert.deepEqual(f.calls, []);
});

test("the replay route returns directly to the camera and skips LUT preparation", () => {
  const calls = [];
  const permissions = { cameraPermission: "granted" };
  const Onboarding = loadModule("app/onboarding.jsx", {
    react: {},
    "expo-router": { Stack: { Screen: "Screen" }, useRouter: () => ({ dismissTo: path => calls.push(path) }) },
    "./components/Welcome": { __esModule: true, default: "Welcome" },
    "./context/SettingsContext": { useSettings: () => ({ customLuts: [] }) },
    "./hooks/useCameraBootstrap": { __esModule: true, default: options => {
      assert.equal(options.loadLuts, false);
      return permissions;
    } },
  }).default;
  const welcome = nodes(Onboarding()).find(node => node.type === "Welcome");
  assert.equal(welcome.props.embedded, true);
  assert.equal(welcome.props.permissions, permissions);
  welcome.props.onComplete();
  assert.deepEqual(calls, ["/"]);
});

test("replay reads permissions without reloading camera LUTs", async t => {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  let loads = 0;
  const useBootstrap = loadModule("app/hooks/useCameraBootstrap.js", {
    react: hooks.react,
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
    "react-native-vision-camera": { Camera: { getCameraPermissionStatus: () => "granted" } },
    "expo-media-library": { getPermissionsAsync: async () => ({ status: "granted" }) },
    "expo-location": { getForegroundPermissionsAsync: async () => ({ status: "denied" }) },
    "../utils/lutProcessor": { loadAllLUTs: async () => loads++, loadCustomLUTs: async () => loads++ },
  }).default;
  const options = { customLuts: [], loadLuts: false };
  hooks.render(() => useBootstrap(options));
  await flush();
  const state = hooks.render(() => useBootstrap(options));
  assert.equal(state.cameraPermission, "granted");
  assert.equal(state.mediaPermission.status, "granted");
  assert.equal(loads, 0);
});

test("Rever apresentação opens its own route without changing first-launch state or popping Settings", t => {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  const calls = [];
  const mocks = {
    react: hooks.react,
    "expo-router": { useRouter: () => ({ push: path => calls.push(["push", path]), back: () => calls.push(["back"]) }) },
    "react-native": { View: "View", Text: "Text", ScrollView: "ScrollView", Platform: { OS: "ios" } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@react-native-documents/picker": {},
    "expo-haptics": {},
    "react-native-fs": {},
    "../context/SettingsContext": { useSettings: () => ({
      loading: false, topBarControls: ["settings"], customLuts: [],
      setFirstTime: value => calls.push(["firstTime", value]),
    }) },
    "../hooks/useCompositionModel": { __esModule: true, default: () => ({ status: { state: "ready" } }) },
    "../utils/lutProcessor": {},
    "./ControlGestureSettings": { __esModule: true, default: "Gestures", CONTROL_GESTURE_FIELDS: [] },
    "./Settings.styles": { __esModule: true, default: {} },
  };
  for (const name of ["ScreenHeader", "HeifPlusSettings", "CustomLUTItem", "CustoToggle", "TopBarControlList"])
    mocks[`./${name}`] = { __esModule: true, default: name };
  const Settings = loadModule("app/components/Settings.jsx", mocks).default;
  const tree = hooks.render(() => Settings({ initialPage: "about" }));
  nodes(tree).find(node => node.props?.label === "Rever apresentação").props.onPress();
  assert.deepEqual(calls, [["push", "/onboarding"]]);
});
