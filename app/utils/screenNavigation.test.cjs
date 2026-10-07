const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");

test("shared back button preserves existing positioning and supports a header without fixed offsets", () => {
  let backs = 0, customBacks = 0;
  const { default: BackButton } = loadModule("app/components/BackButton.jsx", {
    "expo-router": { router: { back: () => backs++ } },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "react-native": { TouchableOpacity: "TouchableOpacity" },
    "./BackButton.styles": { button: "absolute", inlineButton: "inline" },
    react: {},
  });
  const existing = BackButton({});
  assert.deepEqual(existing.props.style, ["absolute", { top: 59, left: 16 }]);
  existing.props.onPress();
  assert.equal(backs, 1);
  const inline = BackButton({ inline: true });
  assert.equal(inline.props.style, "inline");
  assert.equal(inline.props.accessibilityLabel, "Voltar");
  inline.props.onPress();
  assert.equal(backs, 2);
  BackButton({ inline: true, onPress: () => customBacks++ }).props.onPress();
  assert.equal(customBacks, 1);
  assert.equal(backs, 2);
});

test("settings routes normalize parameters and keep gesture selection inside the navigation stack", () => {
  let params = { section: "gestures", control: "volumeUp" };
  const { default: Section } = loadModule("app/components/SettingsSection.jsx", {
    "expo-router": { useLocalSearchParams: () => params },
    "./Settings": { __esModule: true, default: "Settings", SETTINGS_PAGES: {
      ROOT: "root", CAMERA: "camera", PREVIEWS: "previews", CAPTURE: "capture",
      INTELLIGENCE: "intelligence", CONTROLS: "controls", GESTURES: "gestures", LUTS: "luts", ABOUT: "about",
    } },
    react: {},
  });
  assert.deepEqual(Section().props, { initialPage: "gestures", gestureField: "volumeUp" });
  params = { section: ["gestures"], control: ["vertical"] };
  assert.deepEqual(Section().props, { initialPage: "gestures", gestureField: "vertical" });
  params = { section: "invalid" };
  assert.equal(Section().props.initialPage, "root");
});
