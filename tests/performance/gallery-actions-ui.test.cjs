const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../helpers/loadModule.cjs");
const { createHooks, flush } = require("../helpers/hooks.cjs");

function nodes(tree, predicate, result = []) {
  if (Array.isArray(tree)) tree.forEach((child) => nodes(child, predicate, result));
  else if (tree && typeof tree === "object") {
    if (predicate(tree)) result.push(tree);
    nodes(tree.props?.children, predicate, result);
  }
  return result;
}

async function fixture(rate, options = {}) {
  const hooks = createHooks();
  const photos = ["a", "b"].map((id, index) => ({ id, uri: `file:///${id}.jpg`, creationTime: index + 1, rating: 2 }));
  const permission = { granted: true };
  const requestPermission = () => {};
  const settings = { projects: [], activeProjectId: null, setProjects() {} };
  const alerts = [];
  let deleted = [];
  let shared = [];
  class Value {
    interpolate() { return 0; }
    setValue() {}
  }
  const animated = { Value, View: "AnimatedView", Image: "AnimatedImage", spring: () => ({ start() {} }), timing: () => ({ start() {} }) };
  const { default: Gallery } = loadModule("app/components/Galery.jsx", {
    react: hooks.react,
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "FlatList", "Image", "Modal", "Pressable", "ScrollView", "SectionList", "Text", "TouchableOpacity", "View"].map((name) => [name, name])),
      Animated: animated, Alert: { alert: (...args) => alerts.push(args) },
      Platform: { OS: "ios" }, Easing: { cubic: () => {}, inOut: () => {} },
      PanResponder: { create: () => ({ panHandlers: {} }) },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "expo-blur": { BlurView: "BlurView" },
    "expo-image": { Image: "Image" },
    "../hooks/useGalleryPhotoDetails": () => () => {},
    "../utils/galleryCache": { getCachedGalleryPhotos: () => options.cached, galleryCacheKey: () => "Komorebi", cacheGalleryPhotos() {}, clearGalleryCache() {} },
    "./CustoToggle": "CustomToggle",
    "./PhotoDepthScan": "PhotoDepthScan",
    "expo-status-bar": { StatusBar: "StatusBar" },
    "expo-router": { useRouter: () => ({ push() {} }) },
    "expo-media-library": {
      usePermissions: () => [permission, requestPermission], addListener: () => ({ remove() {} }),
    },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../context/SettingsContext": { useSettings: () => settings },
    "../utils/exifFormatter": { exifHandler: (id, callback) => callback({}) },
    "../utils/exifSchema": { EXIF_SCHEMA: {} },
    "../utils/projects": { getProjectAlbumName: () => "Komorebi" },
    "../utils/galleryPhotos": { loadGalleryPhotos: options.load || (async () => photos) },
    "../utils/galleryActions": {
      rateGalleryPhotos: rate || (async () => ({ succeeded: ["a"], failed: [{ id: "b" }], pending: [] })),
      shareGalleryPhotos: async (ids) => { shared = ids; },
      deleteGalleryPhotos: async (ids) => { deleted = ids; return false; },
    },
    "../../modules/camera-photo-depth": {
      cancelPhotoDepth: async () => {}, cleanupDeletedDepthBackups: async () => {},
      getPhotoDepthState: async () => ({ eligible: false, canRevert: false, reason: "Aguardando validação" }),
    },
    "./Galery.styles": {}, "./ExifItem": { ExifItem: "ExifItem" }, "./MapViewWeb": { MapViewWeb: "MapViewWeb" },
    "./ScreenHeader": "ScreenHeader", "./LoadingScreen": "LoadingScreen", "./ProjectChecklist": "ProjectChecklist", "./ProjectSwipeList": "ProjectSwipeList",
    "./PhotoRatingControls": "PhotoRatingControls", "./GalleryActionProgress": "GalleryActionProgress",
  });
  const render = () => hooks.render(Gallery);
  const initialTree = render(); await flush();
  return { render, initialTree, photos, alerts, hooks, get deleted() { return deleted; }, get shared() { return shared; } };
}

function button(tree, label) {
  return nodes(tree, (node) => node.type === "TouchableOpacity" && nodes(node.props.children, (child) => child.type === "Text" && child.props.children === label).length)[0];
}
function tile(tree, photo) {
  return nodes(tree, (node) => node.type === "SectionList")[0].props.renderItem({ item: [photo] }).props.children[0][0];
}

test("long press selects without opening a viewer; successful ratings leave only failed photos selected", async () => {
  const f = await fixture();
  let tree = f.render();
  tile(tree, f.photos[0]).props.onLongPress();
  tree = f.render();
  tile(tree, f.photos[1]).props.onPress();
  tree = f.render();
  assert.equal(nodes(tree, (node) => node.type === "ScreenHeader")[0].props.title, "2 selecionadas");
  assert.equal(nodes(tree, (node) => node.type === "Modal")[1].props.visible, false);
  button(tree, "Avaliar").props.onPress();
  tree = f.render();
  const modal = nodes(tree, (node) => node.type === "Modal")[0];
  assert.equal(modal.props.visible, true);
  await nodes(modal, (node) => node.type === "PhotoRatingControls")[0].props.onRate(4);
  tree = f.render();
  assert.equal(nodes(tree, (node) => node.type === "ScreenHeader")[0].props.title, "1 selecionada");
  assert.equal(tile(tree, f.photos[0]).props.accessibilityState.checked, false);
  assert.equal(tile(tree, f.photos[1]).props.accessibilityState.checked, true);
  assert.equal(f.alerts.length, 1);
  f.hooks.dispose();
});

test("batch share uses selected IDs; deletion awaits confirmation and cancellation keeps the selection", async () => {
  const f = await fixture();
  nodes(nodes(f.render(), (node) => node.type === "ScreenHeader")[0].props.right, (node) => node.type === "ProjectSwipeList")[0].props.onToggleSelection();
  tile(f.render(), f.photos[0]).props.onPress();
  await button(f.render(), "Compartilhar").props.onPress();
  assert.deepEqual(f.shared, ["a"]);
  button(f.render(), "Apagar").props.onPress();
  assert.deepEqual(f.deleted, []);
  const dialog = f.alerts.at(-1);
  assert.match(dialog[1], /biblioteca/);
  await dialog[2].find((choice) => choice.text === "Apagar").onPress();
  assert.deepEqual(f.deleted, ["a"]);
  assert.equal(tile(f.render(), f.photos[0]).props.accessibilityState.checked, true);
  nodes(nodes(f.render(), (node) => node.type === "ScreenHeader")[0].props.right, (node) => node.type === "ProjectSwipeList")[0].props.onToggleSelection();
  assert.equal(nodes(f.render(), (node) => node.type === "ScreenHeader")[0].props.title, "Galeria");
  f.hooks.dispose();
});

test("individual rating remains accessible in the consolidated photo details panel", async () => {
  const previousFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = (callback) => callback();
  const f = await fixture();
  try {
    tile(f.render(), f.photos[0]).props.onPress();
    let tree = f.render();
    const viewer = () => nodes(tree, (node) => node.type === "Modal")[1];
    assert.equal(viewer().props.visible, true);
    nodes(viewer(), (node) => node.props?.accessibilityLabel === "Informações da foto")[0].props.onPress();
    tree = f.render();
    const panel = () => nodes(viewer(), (node) => node.type === "AnimatedView" && node.props.pointerEvents && nodes(node, (child) => child.type === "PhotoRatingControls").length === 1).at(-1);
    assert.equal(panel().props.pointerEvents, "auto");
    assert.equal(nodes(panel(), (node) => node.type === "PhotoRatingControls").length, 1);
    viewer().props.onRequestClose();
    tree = f.render();
    assert.equal(viewer().props.visible, true);
    assert.equal(panel().props.pointerEvents, "none");
  } finally {
    f.hooks.dispose();
    global.requestAnimationFrame = previousFrame;
  }
});

test("a cached gallery renders on the first frame while native refresh is still pending", async () => {
  let publish;
  const cached = [{ id: "recent", uri: "ph://recent", creationTime: 10 }];
  const f = await fixture(undefined, {
    cached,
    load: (_project, _current, onPreview) => {
      publish = onPreview;
      return new Promise(() => {});
    },
  });
  assert.equal(nodes(f.initialTree, (node) => node.type === "LoadingScreen").length, 0);
  const grid = nodes(f.initialTree, (node) => node.type === "SectionList")[0];
  assert.equal(grid.props.sections[0].data[0][0].id, "recent");
  publish([{ id: "new", uri: "ph://new", creationTime: 11 }], false);
  let currentGrid = nodes(f.render(), (node) => node.type === "SectionList")[0];
  assert.deepEqual(currentGrid.props.sections.flatMap((section) => section.data.flat()).map((photo) => photo.id), ["new", "recent"]);
  publish([{ id: "new", uri: "ph://new", creationTime: 11 }], true);
  currentGrid = nodes(f.render(), (node) => node.type === "SectionList")[0];
  assert.deepEqual(currentGrid.props.sections.flatMap((section) => section.data.flat()).map((photo) => photo.id), ["new"]);
  f.hooks.dispose();
});

test("gallery viewability accepts section headers and footers as well as photo rows", async () => {
  const cached = [
    { id: "photo-new", uri: "ph://photo-new", creationTime: Date.UTC(2025, 0, 3, 12) },
    { id: "photo-old", uri: "ph://photo-old", creationTime: Date.UTC(2025, 0, 1, 12) },
  ];
  const f = await fixture(undefined, { cached, load: () => new Promise(() => {}) });
  try {
    const grid = nodes(f.initialTree, (node) => node.type === "SectionList")[0];
    const keys = new Set();
    for (const section of grid.props.sections) {
      // VirtualizedSectionList._convertViewable passes the section object for
      // both header/footer tokens, using index 0 when the item index is null.
      const headerKey = grid.props.keyExtractor(section, 0);
      assert.equal(typeof headerKey, "string");
      assert.equal(grid.props.keyExtractor(section, 0), headerKey);
      assert.ok(!keys.has(headerKey));
      keys.add(headerKey);
      for (const [index, row] of section.data.entries()) {
        const key = grid.props.keyExtractor(row, index);
        assert.equal(typeof key, "string");
        assert.ok(!keys.has(key));
        keys.add(key);
      }
    }
  } finally {
    f.hooks.dispose();
  }
});
