const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks } = require("../../tests/helpers/hooks.cjs");

function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const native = { Platform: { OS: "ios" }, View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView" };
const { getOnboardingControlPresets } = loadModule("app/utils/onboardingControlPresets.js", { "react-native": native });
const { TOP_BAR_CONTROLS, TOP_BAR_MAX_CONTROLS } = loadModule("app/utils/topBarControls.js", { "react-native": native });

test("presets use distinct, valid shortcut sets within the limit and keep Settings", () => {
  for (const platform of ["ios", "android"]) {
    const presets = getOnboardingControlPresets(platform);
    assert.equal(presets.length, 3);
    assert.equal(new Set(presets.map(p => p.controls.join(","))).size, 3);
    for (const preset of presets) {
      assert.ok(preset.controls.length <= TOP_BAR_MAX_CONTROLS);
      assert.equal(new Set(preset.controls).size, preset.controls.length);
      assert.ok(preset.controls.includes("settings"));
      assert.ok(preset.controls.every(id => TOP_BAR_CONTROLS.some(control => control.id === id)));
      if (platform === "android") {
        assert.ok(!preset.controls.includes("livePhoto"));
        assert.ok(!preset.controls.includes("stacking"));
      }
    }
  }
});

test("presets apply shortcuts immediately; customization stays opt-in and can return to a preset", t => {
  const hooks = createHooks();
  const editorHooks = createHooks();
  t.after(() => { hooks.dispose(); editorHooks.dispose(); });
  let controls = [...getOnboardingControlPresets()[1].controls];
  const onChange = value => { controls = value; };
  const Component = loadModule("app/components/OnboardingControls.jsx", {
    react: hooks.react,
    "react-native": native,
    "@expo/vector-icons": { Ionicons: "Icon" },
    "./TopBarControlList": { __esModule: true, default: "Controls" },
    "./Welcome.styles": { __esModule: true, default: {} },
  }).default;
  const render = () => hooks.render(() => Component({ controls, onChange, onDragStateChange() {} }));
  const editor = tree => nodes(tree).find(node => node.type?.name === "TopBarCustomizer");
  const personalize = tree => nodes(tree).find(node => node.props?.accessibilityState?.expanded !== undefined);
  assert.equal(editor(render()), undefined);
  assert.equal(nodes(render()).filter(node => node.props?.accessibilityState?.checked).length, 1);
  for (const preset of getOnboardingControlPresets()) {
    nodes(render()).find(node => node.props?.accessibilityLabel === preset.title).props.onPress();
    assert.deepEqual(controls, preset.controls);
    assert.equal(editor(render()), undefined);
    assert.ok(nodes(render()).some(node => node.props?.children === preset.controls.map(id => TOP_BAR_CONTROLS.find(control => control.id === id).label).join(" · ")));
  }
  const before = [...controls];
  personalize(render()).props.onPress();
  assert.deepEqual(controls, before);
  assert.equal(nodes(render()).filter(node => node.props?.accessibilityState?.checked).length, 1);
  assert.equal(personalize(render()).props.accessibilityState.checked, true);
  const customizer = editor(render());
  const editorTree = editorHooks.render(() => customizer.type(customizer.props));
  const list = nodes(editorTree).find(node => node.type === "Controls");
  list.props.onRemove("doubleCapture");
  assert.ok(!controls.includes("doubleCapture"));
  assert.equal(nodes(render()).filter(node => node.props?.accessibilityState?.checked).length, 1);
  assert.ok(editor(render()));
  personalize(render()).props.onPress();
  assert.ok(editor(render()));
  assert.ok(!controls.includes("doubleCapture"));
  nodes(render()).find(node => node.props?.accessibilityLabel === getOnboardingControlPresets()[0].title).props.onPress();
  assert.deepEqual(controls, getOnboardingControlPresets()[0].controls);
});

test("preset icons rise and fade in sequence, stop on cleanup and respect reduced motion", t => {
  for (const reduceMotion of [false, true]) {
    const hooks = createHooks();
    t.after(() => hooks.dispose());
    let activeHooks = hooks;
    const timings = [];
    const springs = [];
    let starts = 0;
    let stops = 0;
    class Value {
      constructor(value) { this.value = value; }
      setValue(value) { this.value = value; }
    }
    const Component = loadModule("app/components/OnboardingControls.jsx", {
      react: {
        ...hooks.react,
        useRef: (...args) => activeHooks.react.useRef(...args),
        useEffect: (...args) => activeHooks.react.useEffect(...args),
      },
      "react-native": { ...native, Animated: {
        View: "AnimatedView", Value,
        timing: (_, config) => { timings.push(config); return {}; },
        spring: (_, config) => { springs.push(config); return {}; },
        parallel: () => ({ start() { starts++; }, stop() { stops++; } }),
      } },
      "@expo/vector-icons": { Ionicons: "Icon" },
      "./TopBarControlList": { __esModule: true, default: "Controls" },
      "./Welcome.styles": { __esModule: true, default: {} },
    }).default;
    const controls = getOnboardingControlPresets()[0].controls;
    const tree = hooks.render(() => Component({ controls, onChange() {}, reduceMotion }));
    const icons = nodes(tree).filter(node => node.type?.name === "PresetControlIcon");
    assert.equal(icons.length, controls.length);
    icons.forEach((icon, index) => {
      assert.equal(icon.props.index, index);
      const iconHooks = createHooks();
      activeHooks = iconHooks;
      const rendered = iconHooks.render(() => icon.type(icon.props));
      assert.equal(rendered.props.style[1].transform[0].translateY.value, reduceMotion ? 0 : 18);
      iconHooks.dispose();
    });
    if (reduceMotion) {
      assert.equal(starts, 0);
    } else {
      assert.equal(starts, controls.length);
      assert.equal(stops, starts);
      assert.deepEqual(timings.map(config => config.delay), controls.map((_, index) => index * 70));
      assert.ok(springs.every(config => config.toValue === 0 && config.damping === 10 && config.useNativeDriver));
    }
  }
});
