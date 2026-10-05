const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../helpers/loadModule.cjs");
const { createHooks, deferred, flush } = require("../helpers/hooks.cjs");

function fixture(location) {
  const hooks = createHooks();
  const mocks = {
    react: hooks.react,
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-location": location,
    "expo-symbols": { SymbolView: "Symbol" },
    "expo-router": { useRouter: () => ({}) },
    "react-native": { View: "View", Text: "Text", TouchableOpacity: "Button" },
    "react-native-popover-view": "Popover",
    "react-native-reanimated": { View: "View" },
    "../hooks/useDeviceOrientation": () => ({}),
    "./TopBar.styles": {},
  };
  for (const child of [
    "FileFormatSelector",
    "AspectRatioSelector",
    "ProjectSelector",
    "PhotoWeather",
    "ImageStackingSelector",
    "ImageStackingStatus",
  ])
    mocks[`./${child}`] = child;
  const TopBar = loadModule("app/components/TopBar.jsx", mocks).default;
  return {
    hooks,
    render: (controls) =>
      hooks.render(() =>
        TopBar({ topBarControls: controls, firstTime: false }),
      ),
  };
}

test("hidden weather control does not request GPS permission or location", async () => {
  let requests = 0;
  const f = fixture({
    requestForegroundPermissionsAsync: async () => {
      requests++;
      return { status: "granted" };
    },
    getCurrentPositionAsync: async () => {
      throw new Error("must not request position");
    },
  });
  f.render(["settings"]);
  await flush();
  assert.equal(requests, 0);
  f.hooks.dispose();
});

test("disabling weather while permission is pending prevents the GPS request", async () => {
  const permission = deferred();
  let positions = 0;
  const f = fixture({
    requestForegroundPermissionsAsync: () => permission.promise,
    getCurrentPositionAsync: async () => {
      positions++;
    },
  });
  f.render(["weather"]);
  f.render([]);
  permission.resolve({ status: "granted" });
  await flush();
  assert.equal(positions, 0);
  f.hooks.dispose();
});

test("enabled weather keeps both endpoints; cleanup aborts their requests", async () => {
  const signals = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    signals.push({ url, signal: options.signal });
    return new Promise(() => {});
  };
  try {
    const f = fixture({
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getCurrentPositionAsync: async () => ({
        coords: { latitude: 10, longitude: 20 },
      }),
    });
    f.render(["weather"]);
    await flush();
    f.render(["weather"]);
    assert.equal(signals.length, 2);
    assert.ok(
      signals.every(
        ({ url, signal }) =>
          url.includes("latitude=10&longitude=20") && !signal.aborted,
      ),
    );
    f.hooks.dispose();
    assert.ok(signals.every(({ signal }) => signal.aborted));
  } finally {
    global.fetch = originalFetch;
  }
});
