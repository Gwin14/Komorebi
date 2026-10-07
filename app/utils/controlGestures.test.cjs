const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_CONTROL_GESTURES, normalizeControlGestures, cycleOption,
  getPhysicalLenses, executeCameraShortcut,
} = require("./controlGestures");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks } = require("../../tests/helpers/hooks.cjs");

const options = [{ id: "none", name: "Sem efeito" }, { id: "soft", name: "Suave" }, { id: "custom", name: "Importado" }];
function fixture() {
  const calls = [];
  const state = {
    active: true, busy: false,
    capture: (options) => calls.push(["capture", options]),
    notice: (message) => calls.push(["notice", message]),
    manual: { available: true, manualMode: "auto", toggleManualMode: () => calls.push(["manual"]) },
    stacking: { enabled: false, strategyId: null, capabilities: { supportedStrategies: ["bulb", "doubleExposure"] } },
    selectStacking: (mode) => calls.push(["stacking", mode]),
    setActiveControl: (value) => calls.push(["panel", typeof value === "function" ? value("manual") : value]),
    targets: Object.fromEntries(["luts", "grain", "halation", "lens"].map((key) => [key, {
      options, currentId: "soft", label: key, select: (id) => calls.push([key, id]),
    }])),
  };
  return { state, calls };
}

test("old installations and malformed settings preserve defaults independently", () => {
  for (const value of [null, undefined, false, [], "bad"])
    assert.deepEqual(normalizeControlGestures(value), DEFAULT_CONTROL_GESTURES);
  assert.deepEqual(normalizeControlGestures({ vertical: "bulb", horizontal: "unknown", volumeUp: "capture3", volumeDown: "lensPrevious" }), {
    vertical: "bulb", horizontal: "off", volumeUp: "capture3", volumeDown: "lensPrevious",
  });
});

test("settings round-trip through the actual storage loader, including invalid JSON", async () => {
  const stored = new Map();
  const storage = loadModule("app/utils/settingsStorage.js", {
    "react-native": { Platform: { OS: "ios" } },
    "@react-native-async-storage/async-storage": {
      multiGet: async (keys) => keys.map((key) => [key, stored.get(key) ?? null]),
      setItem: async (key, value) => stored.set(key, value),
      removeItem: async (key) => stored.delete(key),
    },
  });
  const defaults = { photoFormat: "heif", projects: [], customLuts: [] };
  assert.deepEqual((await storage.loadStoredSettings(defaults)).controlGestures, DEFAULT_CONTROL_GESTURES);
  const settings = { vertical: "manual", horizontal: "halation", volumeUp: "capture3", volumeDown: "capture10" };
  await storage.saveStoredSetting(storage.SETTINGS_STORAGE_KEYS.CONTROL_GESTURES, JSON.stringify(settings));
  assert.deepEqual((await storage.loadStoredSettings(defaults)).controlGestures, settings);
  stored.set(storage.SETTINGS_STORAGE_KEYS.CONTROL_GESTURES, JSON.stringify({ ...settings, horizontal: "removed" }));
  assert.equal((await storage.loadStoredSettings(defaults)).controlGestures.horizontal, "off");
  stored.set(storage.SETTINGS_STORAGE_KEYS.CONTROL_GESTURES, "{");
  const oldError = console.error;
  console.error = () => {};
  try { assert.deepEqual((await storage.loadStoredSettings(defaults)).controlGestures, DEFAULT_CONTROL_GESTURES); }
  finally { console.error = oldError; }
});

test("effect cycling wraps both ways and safely resumes after deleting an imported LUT", () => {
  assert.equal(cycleOption(options, "custom", 1).id, "none");
  assert.equal(cycleOption(options, "none", -1).id, "custom");
  assert.equal(cycleOption(options, "removed", -1).id, "none");
  assert.equal(cycleOption([], "none", 1), null);
});

test("physical lenses exclude crops and virtual devices and deduplicate devices", () => {
  const device = (id, types) => ({ id, physicalDevices: types });
  const lenses = [
    { id: "tele", order: 3, source: "physical", device: device("T", ["telephoto-camera"]) },
    { id: "2x", order: 2, source: "secondary-native", device: device("W", ["wide-angle-camera"]) },
    { id: "wide", order: 1, source: "physical", device: device("W", ["wide-angle-camera"]) },
    { id: "duplicate", order: 1, source: "physical", device: device("W", ["wide-angle-camera"]) },
    { id: "virtual", order: 0, device: device("V", ["wide-angle-camera", "telephoto-camera"]) },
    { id: "ultra", order: 0, device: device("U", ["ultra-wide-angle-camera"]) },
  ];
  assert.deepEqual(getPhysicalLenses(lenses).map(({ id }) => id), ["ultra", "wide", "tele"]);
});

test("busy camera blocks effects, lenses and modes but allows the shutter's finishing path", async () => {
  const { state, calls } = fixture();
  state.busy = true;
  for (const action of ["luts", "grain", "halation", "lens", "lutsPanel", "manual", "bulb"])
    await executeCameraShortcut(action, 1, state);
  assert.deepEqual(calls, []);
  await executeCameraShortcut("capture10", 1, state);
  assert.deepEqual(calls, [["capture", { seconds: 10 }]]);
  state.active = false;
  await executeCameraShortcut("capture", 1, state);
  assert.equal(calls.length, 1);
});

for (const [action, seconds] of [["capture", undefined], ["capture3", 3], ["capture10", 10]]) {
  test(`${action} passes its timer only to that capture`, async () => {
    const { state, calls } = fixture();
    await executeCameraShortcut(action, 1, state);
    assert.deepEqual(calls, [["capture", { seconds }]]);
  });
}

test("manual gestures activate/deactivate idempotently and report incompatibility", async () => {
  const { state, calls } = fixture();
  await executeCameraShortcut("manual", 1, state);
  assert.equal(calls.filter(([type]) => type === "manual").length, 1);
  state.manual.manualMode = "manual";
  calls.length = 0;
  await executeCameraShortcut("manual", 1, state);
  assert.deepEqual(calls, []);
  await executeCameraShortcut("manual", -1, state);
  assert.equal(calls.filter(([type]) => type === "manual").length, 1);
  state.manual.manualMode = "auto";
  state.stacking.enabled = true;
  calls.length = 0;
  await executeCameraShortcut("manual", 1, state);
  assert.equal(calls[0][0], "notice");
  assert.equal(calls.length, 1);
});

test("stacking gestures reuse session handler and never deactivate another mode", async () => {
  const { state, calls } = fixture();
  await executeCameraShortcut("bulb", 1, state);
  assert.deepEqual(calls[0], ["stacking", "bulb"]);
  state.stacking.strategyId = "bulb";
  calls.length = 0;
  await executeCameraShortcut("bulb", 1, state);
  await executeCameraShortcut("doubleExposure", -1, state);
  assert.deepEqual(calls, []);
  await executeCameraShortcut("bulb", -1, state);
  assert.deepEqual(calls[0], ["stacking", null]);
  calls.length = 0;
  await executeCameraShortcut("focusBracketing", 1, state);
  assert.equal(calls[0][0], "notice");
});

test("closing LUTs preserves another open panel", async () => {
  const { state, calls } = fixture();
  await executeCameraShortcut("lutsPanel", -1, state);
  assert.deepEqual(calls, [["panel", "manual"]]);
});

test("effect dispatch shares selection handlers; single-lens cycling makes no session change", async () => {
  const { state, calls } = fixture();
  for (const action of ["luts", "grain", "halation"])
    await executeCameraShortcut(action, -1, state);
  assert.deepEqual(calls.filter(([type]) => type !== "notice"), [
    ["luts", "none"], ["grain", "none"], ["halation", "none"],
  ]);
  calls.length = 0;
  state.targets.lens.options = [{ id: "soft", label: "1" }];
  await executeCameraShortcut("lens", 1, state);
  assert.deepEqual(calls, []);
});

test("hardware listener forwards distinct buttons once, updates callbacks and cleans up", () => {
  const hooks = createHooks();
  let listener;
  let starts = 0, stops = 0, removals = 0;
  const { default: useButtons } = loadModule("app/hooks/useCameraControlButton.js", {
    react: { ...hooks.react, useLayoutEffect: hooks.react.useEffect },
    "../../modules/camera-control-button": {
      addCameraButtonListener: (fn) => { listener = fn; return { remove: () => removals++ }; },
      startListening: async () => { starts++; },
      stopListening: async () => { stops++; },
    },
  });
  const calls = [];
  let enabled = true;
  let onPress = (event) => calls.push(event.type);
  const render = () => hooks.render(() => useButtons({ enabled, onPress }));
  render();
  listener({ type: "primary" }); listener({ type: "secondary" });
  assert.deepEqual(calls, ["primary", "secondary"]);
  onPress = (event) => calls.push(`new:${event.type}`);
  render(); listener({ type: "primary" });
  assert.equal(calls[2], "new:primary");
  assert.equal(starts, 1);
  enabled = false;
  render(); listener({ type: "primary" });
  assert.equal(calls.length, 3);
  assert.equal(stops, 1);
  assert.equal(removals, 1);
  hooks.dispose();
});

test("pan gestures choose one axis, ignore cancelled gestures and preserve pinch zoom", () => {
  const hooks = createHooks();
  const pans = [];
  let pinch;
  const gesture = (kind) => {
    const spec = { kind };
    for (const method of ["enabled", "onBegin", "onUpdate", "minPointers", "maxPointers", "activeOffsetX", "activeOffsetY", "failOffsetX", "failOffsetY", "onEnd", "numberOfTaps", "onStart"])
      spec[method] = (value) => { spec[`_${method}`] = value; return spec; };
    if (kind === "pan") pans.push(spec);
    if (kind === "pinch") pinch = spec;
    return spec;
  };
  const { default: useGestures } = loadModule("app/hooks/useCameraGestures.js", {
    react: hooks.react,
    "react-native-gesture-handler": { Gesture: {
      Pan: () => gesture("pan"), Pinch: () => gesture("pinch"), Tap: () => gesture("tap"),
      Race: (...children) => ({ kind: "race", children }),
      Simultaneous: (...children) => ({ kind: "simultaneous", children }),
    } },
    "react-native-reanimated": { runOnJS: (fn) => fn },
  });
  const calls = [];
  const args = {
    disabled: false, horizontalEnabled: true,
    lastZoom: { value: 1 }, zoomSV: { value: 2 }, minZoom: 1, maxZoom: 5,
    setZoom: (zoom) => calls.push(["zoom", zoom]),
    onVerticalSwipe: (direction) => calls.push(["vertical", direction]),
    onHorizontalSwipe: (direction) => calls.push(["horizontal", direction]),
  };
  const composed = hooks.render(() => useGestures(args));
  assert.equal(composed.kind, "simultaneous");
  assert.equal(composed.children[1].kind, "race");
  const event = (x, y) => ({ translationX: x, translationY: y, velocityX: 0, velocityY: 0 });
  pans[0]._onEnd(event(0, -60), true);
  pans[0]._onEnd(event(0, 60), true);
  pans[1]._onEnd(event(60, 0), true);
  pans[1]._onEnd(event(-60, 0), true);
  assert.deepEqual(calls, [["vertical", 1], ["vertical", -1], ["horizontal", 1], ["horizontal", -1]]);
  calls.length = 0;
  pans[0]._onEnd(event(0, -60), false);
  pans[1]._onEnd(event(60, 0), false);
  pans[0]._onEnd(event(80, -60), true);
  pans[1]._onEnd(event(60, 80), true);
  pans[0]._onEnd(event(0, 15), true);
  assert.deepEqual(calls, []);
  pinch._onBegin();
  pinch._onUpdate({ scale: 4 });
  assert.equal(args.zoomSV.value, 5);
  assert.deepEqual(calls, [["zoom", 5]]);
  args.disabled = true;
  hooks.render(() => useGestures(args));
  assert.equal(pans.at(-1)._enabled, false);
  assert.equal(pans.at(-2)._enabled, false);
  hooks.dispose();
});

for (const platform of ["ios", "android"]) {
  test(`settings on ${platform} display defaults, filter modes and save each button independently`, () => {
    const hooks = createHooks();
    let settings = { ...DEFAULT_CONTROL_GESTURES };
    let fieldKey = null;
    const navigation = [];
    const router = {
      push: (route) => {
        navigation.push(route);
        fieldKey = route.params.control;
      },
      back: () => { navigation.push("back"); fieldKey = null; },
    };
    const { default: Settings } = loadModule("app/components/ControlGestureSettings.jsx", {
      react: hooks.react,
      "expo-router": { useRouter: () => router },
      "react-native": { Platform: { OS: platform }, View: "View", Text: "Text", Pressable: "Pressable" },
      "@expo/vector-icons": { Ionicons: "Icon" },
      "../context/SettingsContext": { useSettings: () => ({
        controlGestures: settings,
        setControlGestures: (fn) => { settings = normalizeControlGestures(fn(settings)); },
      }) },
      "./Settings.styles": {},
      "./ControlGestureSettings.styles": {},
    });
    function flatten(node) {
      if (Array.isArray(node)) return node.flatMap(flatten);
      if (!node || typeof node !== "object") return [];
      return [node, ...flatten(node.props?.children)];
    }
    const render = () => flatten(hooks.render(() => Settings({ fieldKey })));
    const pressables = () => render().filter(({ type }) => type === "Pressable");
    let buttons = pressables();
    assert.equal(buttons.length, 4);
    assert.equal(buttons[0].props.accessibilityLabel, "Para cima e para baixo: LUTs");
    assert.equal(buttons[1].props.accessibilityLabel, "Para os lados: Desativado");
    buttons[0].props.onPress();
    const labels = render().filter(({ type }) => type === "Text").map(({ props }) => props.children);
    assert.equal(labels.includes("Manual"), platform === "ios");
    assert.equal(labels.includes("Bulb"), platform === "ios");
    assert.deepEqual(navigation[0], {
      pathname: "/components/SettingsSection",
      params: { section: "gestures", control: "vertical" },
    });
    router.back();
    pressables()[2].props.onPress();
    const timer3 = pressables().find((node) => flatten(node).some(({ type, props }) => type === "Text" && props.children === "Foto com timer de 3s"));
    timer3.props.onPress();
    assert.equal(settings.volumeUp, "capture3");
    assert.equal(settings.volumeDown, "capture");
    assert.equal(navigation.at(-1), "back");
    pressables()[3].props.onPress();
    const timer10 = pressables().find((node) => flatten(node).some(({ type, props }) => type === "Text" && props.children === "Foto com timer de 10s"));
    timer10.props.onPress();
    assert.equal(settings.volumeDown, "capture10");
    assert.equal(settings.volumeUp, "capture3");
    hooks.dispose();
  });
}
