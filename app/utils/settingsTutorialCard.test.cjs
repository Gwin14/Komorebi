const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");
const { createHooks, deferred } = require("../../tests/helpers/hooks.cjs");

function setup(t, { platform = "ios", openBrowser = async () => {} } = {}) {
  const hooks = createHooks();
  t.after(() => hooks.dispose());
  const alerts = [];
  const mocks = {
    react: hooks.react,
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-haptics": { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: "light" } },
    "expo-web-browser": {
      openBrowserAsync: openBrowser,
      WebBrowserPresentationStyle: { PAGE_SHEET: "pageSheet" },
    },
    "react-native": {
      Alert: { alert: (...args) => alerts.push(args) },
      Platform: { OS: platform },
      Image: "Image", Pressable: "Pressable", Text: "Text", View: "View",
    },
    "./SettingsTutorialCard.styles": { __esModule: true, default: {} },
  };
  for (const name of ["light", "gold", "motion", "palms", "ocean"])
    mocks[`../../assets/images/onboarding/${name}.jpg`] = name;
  const Card = loadModule("app/components/SettingsTutorialCard.jsx", mocks).default;
  return { render: () => hooks.render(() => Card()), alerts };
}

test("tutorial stays stable on re-render and opens its guide in a native page sheet once", async t => {
  t.mock.method(Math, "random", () => 0);
  const browser = deferred();
  const calls = [];
  const { render } = setup(t, { openBrowser: (...args) => { calls.push(args); return browser.promise; } });
  const card = render();
  assert.match(card.props.accessibilityLabel, /RAW/);
  const opening = card.props.onPress();
  await card.props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://komorebimobile.vercel.app/docs/formatos-de-arquivo");
  assert.equal(calls[0][1].presentationStyle, "pageSheet");
  assert.equal(calls[0][1].dismissButtonStyle, "close");
  assert.equal(render().props.disabled, true);
  t.mock.method(Math, "random", () => 0.99);
  browser.resolve();
  await opening;
  assert.equal(render().props.disabled, false);
  assert.equal(render().props.accessibilityLabel, card.props.accessibilityLabel);
});

test("browser failure shows an error and allows another attempt", async t => {
  let attempts = 0;
  const { render, alerts } = setup(t, { openBrowser: async () => { attempts++; throw new Error("unavailable"); } });
  await render().props.onPress();
  assert.equal(alerts.length, 1);
  assert.equal(render().props.disabled, false);
  await render().props.onPress();
  assert.equal(attempts, 2);
});

test("Android tips exclude iOS-only capture modes and keep browser in the app task", async t => {
  for (const random of [0, 0.4, 0.99]) {
    t.mock.method(Math, "random", () => random);
    const calls = [];
    const { render } = setup(t, { platform: "android", openBrowser: async (...args) => calls.push(args) });
    const card = render();
    assert.doesNotMatch(card.props.accessibilityLabel, /RAW|manuais/);
    await card.props.onPress();
    assert.equal(calls[0][1].createTask, false);
    assert.match(calls[0][0], /\/(cores-e-efeitos|galeria-e-projetos|primeiros-passos)$/);
  }
});
