import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompositionScanSession,
  SCAN_POST_ZOOM_DURATION,
  SCAN_TIMEOUT,
} from "../../app/utils/compositionScanSession.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(overrides = {}, generate = () => ({
  kind: "advice", message: "Destacar o assunto", gizmos: [{
    id: "frame", type: "framing", anchor: "scene",
    rect: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
  }],
})) {
  let now = 0, id = 0;
  const pending = new Map(), states = [], cancelled = [], errors = [];
  let analyses = 0;
  const timers = {
    setTimeout(fn, delay) { const key = ++id; pending.set(key, { fn, at: now + delay }); return key; },
    clearTimeout(key) { pending.delete(key); },
  };
  const advance = (ms) => {
    const until = now + ms;
    while (true) {
      const next = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      pending.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = until;
  };
  const controller = createCompositionScanSession({
    model: {
      arm: async () => true,
      analyze: async () => { analyses++; return {}; },
      cancel: async (id) => { cancelled.push(id); },
      ...overrides,
    },
    generate,
    onChange: (s) => states.push(s), onError: (e) => errors.push(e), timers,
  });
  return { controller, states, cancelled, errors, pending, advance,
    current: () => states.at(-1), analyses: () => analyses };
}
const preview = { width: 300, height: 400 };

test("single scan waits for alignment, then remains visible after zoom and exits", async () => {
  const s = setup(); await s.controller.start(preview);
  assert.equal(s.current().state, "capturing");
  await s.controller.captured("token", s.current().scanId);
  assert.equal(s.analyses(), 1); assert.equal(s.current().phase, "entering");
  s.advance(150); assert.equal(s.current().phase, "visible");
  s.advance(60000); assert.equal(s.current().phase, "visible");
  assert.equal(s.controller.completeZoom(), true);
  assert.equal(s.controller.completeZoom(), false);
  s.advance(SCAN_POST_ZOOM_DURATION - 1); assert.equal(s.current().phase, "visible");
  s.advance(1); assert.equal(s.current().phase, "leaving");
  s.advance(200); assert.equal(s.current().state, "idle"); assert.equal(s.pending.size, 0);
});
test("analysis receives recent advice and exposes tracking separately from capture", async () => {
  let receivedContext;
  const s = setup({
    analyze: async (_token, _id, context) => { receivedContext = context; return {}; },
  });
  const controller = createCompositionScanSession({
    model: {
      arm: async () => true,
      analyze: async (_token, _id, context) => { receivedContext = context; return {}; },
      cancel: async () => {},
    },
    getAnalysisContext: () => ({ recentAdvice: [{ topic: "luz", message: "Suavize a luz" }] }),
    generate: () => ({ kind: "balanced", message: "Composição equilibrada", gizmos: [] }),
    onChange: (state) => s.states.push(state),
    timers: { setTimeout: () => 1, clearTimeout: () => {} },
  });
  await controller.start(preview);
  const captureId = s.states.at(-1).scanId;
  assert.ok(captureId);
  assert.equal(s.states.at(-1).trackingScanId, null);
  await controller.captured("token", captureId);
  assert.equal(s.states.at(-1).scanId, null);
  assert.equal(s.states.at(-1).trackingScanId, captureId);
  assert.deepEqual(receivedContext, { recentAdvice: [{ topic: "luz", message: "Suavize a luz" }] });
  controller.dispose();
});
test("double tap before arm settles starts only one scan", async () => {
  const arm = deferred(); const s = setup({ arm: () => arm.promise });
  const first = s.controller.start(preview);
  assert.equal(await s.controller.start(preview), false);
  arm.resolve(true); assert.equal(await first, true);
  assert.equal(s.pending.size, 1);
});
test("duplicate frame and tap during analysis do not cancel or duplicate work", async () => {
  const result = deferred(); const s = setup({ analyze: () => result.promise });
  await s.controller.start(preview); const id = s.current().scanId;
  const work = s.controller.captured("token", id);
  await s.controller.captured("token", id);
  assert.equal(s.cancelled.length, 0);
  assert.equal(await s.controller.start(preview), false);
  result.resolve({}); await work;
  assert.equal(s.current().state, "showing-results");
});
test("rescan removes the old anchored guide", async () => {
  const s = setup(); await s.controller.start(preview);
  const old = s.current().scanId; await s.controller.captured("one", old);
  s.advance(500); await s.controller.start(preview);
  assert.equal(s.current().result, null); assert.notEqual(s.current().scanId, old);
  s.advance(5000); assert.equal(s.current().state, "capturing");
  assert.equal(s.pending.size, 1);
});
for (const reason of ["navigation", "background", "lens", "zoom", "orientation", "shutter"]) {
  test(`cancel on ${reason} discards late analysis`, async () => {
    const result = deferred(); const s = setup({ analyze: () => result.promise });
    await s.controller.start(preview); const id = s.current().scanId;
    const work = s.controller.captured("token", id);
    s.controller.cancel(); result.resolve({}); await work;
    assert.equal(s.current().state, "idle"); assert.equal(s.pending.size, 0);
    assert.deepEqual(s.cancelled, [id]);
  });
}
test("cancel while arm pending releases a late native reservation", async () => {
  const arm = deferred(); const s = setup({ arm: () => arm.promise });
  const work = s.controller.start(preview); s.controller.cancel();
  arm.resolve(true); await work;
  assert.equal(s.current().state, "idle"); assert.equal(s.cancelled.length, 2);
});
test("capture timeout clears resources and reports one failure", async () => {
  const s = setup(); await s.controller.start(preview); s.advance(SCAN_TIMEOUT);
  assert.equal(s.current().state, "idle"); assert.equal(s.errors.length, 1);
  assert.equal(s.pending.size, 0);
});
test("analysis timeout discards its eventual successful result", async () => {
  const result = deferred(); const s = setup({ analyze: () => result.promise });
  await s.controller.start(preview); const work = s.controller.captured("token", s.current().scanId);
  s.advance(SCAN_TIMEOUT); result.resolve({}); await work;
  assert.equal(s.current().state, "idle"); assert.equal(s.errors.length, 1);
});
test("analysis errors and missing image return to idle", async () => {
  for (const token of ["token", ""]) {
    const s = setup({ analyze: async () => { throw new Error("Vision failed"); } });
    await s.controller.start(preview); await s.controller.captured(token, s.current().scanId);
    assert.equal(s.current().state, "idle"); assert.equal(s.errors.length, 1);
  }
});
test("native busy does not attach capture processor or queue a second analysis", async () => {
  const s = setup({ arm: async () => false });
  assert.equal(await s.controller.start(preview), false);
  assert.equal(s.current().state, "idle"); assert.equal(s.analyses(), 0);
});
test("dispose prevents callbacks and clears timers", async () => {
  const result = deferred(); const s = setup({ analyze: () => result.promise });
  await s.controller.start(preview); const work = s.controller.captured("token", s.current().scanId);
  s.controller.dispose(); const count = s.states.length;
  result.resolve({}); await work; s.advance(20000);
  assert.equal(s.states.length, count); assert.equal(s.pending.size, 0);
  assert.equal(await s.controller.start(preview), false);
});
test("20 scans finish with no timers or retained results", async () => {
  const s = setup();
  for (let i = 0; i < 20; i++) {
    await s.controller.start(preview); await s.controller.captured("token", s.current().scanId);
    s.advance(150);
    assert.equal(s.controller.completeZoom(), true);
    s.advance(SCAN_POST_ZOOM_DURATION + 200);
    assert.equal(s.current().result, null); assert.equal(s.pending.size, 0);
  }
  assert.equal(s.analyses(), 20);
});


test("balanced fallback remains visible until zoom completion", async () => {
  const s = setup({}, () => ({
    kind: "balanced", message: "Preservar o equilíbrio", gizmos: [{
      id: "frame", type: "framing", anchor: "scene",
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    }],
  }));
  await s.controller.start(preview);
  await s.controller.captured("token", s.current().scanId);
  assert.equal(s.current().state, "showing-results");
  assert.equal(s.current().result.kind, "balanced");
  assert.equal(s.pending.size, 1);
  assert.equal(s.errors.length, 0);
  s.advance(150);
  s.controller.completeZoom();
  s.advance(SCAN_POST_ZOOM_DURATION + 200);
  assert.equal(s.current().state, "idle");
});

test("a late old result cannot overwrite a newer session", async () => {
  const oldResult = deferred();
  const s = setup({ analyze: () => oldResult.promise });
  await s.controller.start(preview);
  const oldId = s.current().scanId;
  const oldWork = s.controller.captured("old", oldId);
  s.controller.cancel();
  await s.controller.start(preview);
  const newId = s.current().scanId;
  await s.controller.captured("duplicate-old", oldId);
  oldResult.resolve({}); await oldWork;
  assert.equal(s.current().scanId, newId);
  assert.equal(s.current().state, "capturing");
  assert.equal(s.current().result, null);
});
