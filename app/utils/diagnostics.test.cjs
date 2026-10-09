const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("../../tests/helpers/loadModule.cjs");

function fixture() {
  const calls = [];
  let options;
  const sdk = {
    init: (value) => { options = { enabled: true, ...value }; calls.push("init"); },
    close: async () => { calls.push("close"); },
    getClient: () => options ? { getOptions: () => options } : undefined,
  };
  const { configureDiagnostics } = loadModule("app/utils/diagnostics.js", {
    "@sentry/react-native": sdk,
  });
  return { calls, configureDiagnostics, options: () => options };
}

test("a stored opt-out does not initialize Sentry", async () => {
  const { calls, configureDiagnostics } = fixture();
  assert.deepEqual(calls, []);
  await configureDiagnostics(false);
  assert.deepEqual(calls, []);
});

test("opting out blocks events immediately and closes native reporting", async () => {
  const f = fixture();
  await f.configureDiagnostics(true);
  const event = { message: "diagnostic" };
  assert.equal(f.options().beforeSend(event), event);
  const closing = f.configureDiagnostics(false);
  assert.equal(f.options().enabled, false);
  assert.equal(f.options().beforeSend(event), null);
  assert.equal(f.options().beforeSendTransaction(event), null);
  assert.equal(f.options().beforeBreadcrumb(event), null);
  await closing;
  assert.deepEqual(f.calls, ["init", "close"]);
  await f.configureDiagnostics(true);
  assert.deepEqual(f.calls, ["init", "close", "init"]);
});

test("rapid preference changes keep the final choice", async () => {
  const f = fixture();
  await f.configureDiagnostics(true);
  await Promise.all([f.configureDiagnostics(false), f.configureDiagnostics(true)]);
  assert.equal(f.options().enabled, true);
  await Promise.all([f.configureDiagnostics(false), f.configureDiagnostics(true), f.configureDiagnostics(false)]);
  assert.equal(f.calls.at(-1), "close");
  assert.equal(f.options().beforeSend({}), null);
});

test("diagnostics defaults on and persists a user's opt-out through the real loader", async () => {
  const stored = new Map();
  const storage = loadModule("app/utils/settingsStorage.js", {
    "react-native": { Platform: { OS: "ios" } },
    "@react-native-async-storage/async-storage": {
      multiGet: async (keys) => keys.map(key => [key, stored.get(key) ?? null]),
      setItem: async (key, value) => stored.set(key, value),
      removeItem: async key => stored.delete(key),
    },
  });
  const defaults = { diagnosticsEnabled: true, photoFormat: "heif", projects: [], customLuts: [] };
  assert.equal((await storage.loadStoredSettings(defaults)).diagnosticsEnabled, true);
  await storage.saveStoredSetting(storage.SETTINGS_STORAGE_KEYS.DIAGNOSTICS_ENABLED, "false");
  assert.equal((await storage.loadStoredSettings(defaults)).diagnosticsEnabled, false);
});
