import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceAlignmentGate,
  applyCompositionTracking,
  calculateFramingZoom,
  createCompositionTransform,
  getFramingAlignment,
  transformCompositionGizmo,
} from "../../app/utils/compositionCoordinates.js";
import {
  createCompositionAdvisor,
  generateCompositionResult,
} from "../../app/utils/compositionAnalysis.js";
import { emptyScene, portraitScene } from "./fixtures.js";

const close = (a, b, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const preview = { width: 300, height: 400, mirrored: false };
const frame = (rect, message = "Destacar o assunto") => ({
  kind: "advice",
  message,
  gizmos: [{ id: "frame", type: "framing", anchor: "scene", label: message, rect }],
});

test("coordinate transforms preserve, mirror and rotate points", () => {
  const portrait = createCompositionTransform(portraitScene.geometry, preview);
  assert.deepEqual(portrait.point({ x: 0.2, y: 0.7 }), { x: 0.2, y: 0.7 });
  const mirrored = createCompositionTransform(portraitScene.geometry, { ...preview, mirrored: true });
  close(mirrored.point({ x: 0.2, y: 0.7 }).x, 0.8);
  for (const [rotation, expected] of [
    [90, { x: 0.3, y: 0.2 }],
    [180, { x: 0.8, y: 0.3 }],
    [270, { x: 0.7, y: 0.8 }],
  ]) {
    const transformed = createCompositionTransform(
      { width: 100, height: 100, rotation },
      { width: 100, height: 100 },
    ).point({ x: 0.2, y: 0.7 });
    close(transformed.x, expected.x);
    close(transformed.y, expected.y);
  }
});

test("cover crop and invalid dimensions remain guarded", () => {
  const transform = createCompositionTransform(portraitScene.geometry, { width: 225, height: 400 });
  close(transform.point({ x: 0.125, y: 0 }).x, 0);
  close(transform.point({ x: 0.875, y: 1 }).x, 1);
  assert.throws(() => createCompositionTransform(portraitScene.geometry, { width: 0, height: 0 }));
});

test("every successful analysis returns exactly one fixed-aspect frame", () => {
  for (const targetPreview of [preview, { width: 225, height: 400, mirrored: false }]) {
    for (const scene of [emptyScene, portraitScene]) {
      const result = generateCompositionResult(scene, targetPreview);
      assert.equal(result.gizmos.length, 1);
      assert.equal(result.gizmos[0].type, "framing");
      close(result.gizmos[0].rect.width, result.gizmos[0].rect.height);
      close(
        result.gizmos[0].rect.width * targetPreview.width /
          (result.gizmos[0].rect.height * targetPreview.height),
        targetPreview.width / targetPreview.height,
      );
      assert.ok(result.message.length > 0 && result.message.length <= 48);
    }
  }
});

test("model rectangle is preferred and corrected to the preview aspect", () => {
  const result = generateCompositionResult({
    ...emptyScene,
    judgement: {
      source: "minicpm-v-4.6",
      verdict: "advice",
      topic: "espaço vazio",
      message: "Reduzir espaço vazio",
      visualHint: "framing",
      frame: { centerX: 650, centerY: 450, width: 400, height: 600 },
    },
  }, preview);
  assert.equal(result.message, "Reduzir espaço vazio");
  assert.equal(result.gizmos[0].rect.width, result.gizmos[0].rect.height);
  assert.ok(result.gizmos[0].rect.x > 0.3);
});

test("invalid model rectangle falls back to the detected subject", () => {
  const result = generateCompositionResult({
    ...portraitScene,
    judgement: {
      source: "minicpm-v-4.6",
      verdict: "advice",
      topic: "retrato",
      message: "Destacar a pessoa",
      frame: { centerX: 50, centerY: 50, width: 600, height: 600 },
    },
  }, preview);
  assert.equal(result.message, "Destacar a pessoa");
  assert.equal(result.gizmos[0].rect.width, result.gizmos[0].rect.height);
  assert.ok(result.gizmos[0].rect.x >= 0);
});

test("echoed sample frame is rejected in favor of low-confidence Vision saliency", () => {
  const result = generateCompositionResult({
    ...emptyScene,
    subjects: [{ confidence: 0.45, rect: { x: 0.12, y: 0.52, width: 0.24, height: 0.2 } }],
    judgement: {
      source: "minicpm-v-4.6",
      verdict: "advice",
      topic: "ambiente",
      message: "Preservar o equilíbrio",
      frame: { centerX: 500, centerY: 450, width: 600, height: 760 },
    },
  }, preview);
  assert.ok(result.gizmos[0].rect.width < 0.4);
  assert.ok(result.gizmos[0].rect.x < 0.2);
});

test("a concrete model label names the salient subject", () => {
  const result = generateCompositionResult({
    ...emptyScene,
    subjects: [{ confidence: 0.5, rect: { x: 0.3, y: 0.45, width: 0.3, height: 0.22 } }],
    judgement: {
      source: "minicpm-v-4.6",
      verdict: "advice",
      subject: "as plantas",
      topic: "assunto",
      message: "Preservar o equilíbrio",
    },
  }, preview);
  assert.equal(result.message, "Destacar as plantas");
});

test("current-build English semantics produce a specific nominal reason", () => {
  const result = generateCompositionResult({
    ...emptyScene,
    subjects: [{ confidence: 0.5, rect: { x: 0.08, y: 0.05, width: 0.15, height: 0.2 } }],
    judgement: {
      source: "minicpm-v-4.6",
      verdict: "advice",
      topic: "focus on the crate",
      message: "focus on the crate",
      frame: { centerX: 200, centerY: 150, width: 150, height: 200 },
    },
  }, preview);
  assert.equal(result.message, "Destacar o objeto");
});

test("scene geometry avoids generic subject copy when semantics are unusable", () => {
  const result = generateCompositionResult({
    ...emptyScene,
    subjects: [{ confidence: 0.5, rect: { x: 0.04, y: 0.08, width: 0.82, height: 0.82 } }],
    rectangles: [
      { confidence: 0.9, rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 } },
      { confidence: 0.85, rect: { x: 0.55, y: 0.15, width: 0.25, height: 0.5 } },
    ],
    judgement: { source: "minicpm-v-4.6", verdict: "keep", topic: "", message: "" },
  }, preview);
  assert.equal(result.message, "Valorizar as linhas");
});

test("empty analysis uses the conservative centered fallback", () => {
  const result = generateCompositionResult(emptyScene, preview);
  assert.deepEqual(result.gizmos[0].rect, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  assert.equal(result.message, "Preservar o equilíbrio");
});

test("advisor keeps only three recent nominal reasons", () => {
  const advisor = createCompositionAdvisor();
  for (const topic of ["luz", "fundo", "cor", "perspectiva"]) {
    advisor.generate({
      ...emptyScene,
      judgement: { source: "minicpm-v-4.6", verdict: "advice", topic, message: topic },
    }, preview);
  }
  assert.deepEqual(advisor.context().recentAdvice.map((item) => item.topic), ["fundo", "cor", "perspectiva"]);
  advisor.reset();
  assert.deepEqual(advisor.context().recentAdvice, []);
});

test("tracking converts Vision's bottom-left vertical axis while preserving a rectangle", () => {
  const geometry = { width: 300, height: 400, rotation: 0, mirrored: false };
  const original = frame({ x: 0.2, y: 0.25, width: 0.4, height: 0.4 });
  const tracked = applyCompositionTracking(original, geometry, preview, {
    lost: false,
    matrix: [1, 0, 0.1, 0, 1, 0.05, 0, 0, 1],
  });
  close(tracked.gizmos[0].rect.x, 0.3);
  close(tracked.gizmos[0].rect.y, 0.2);
  close(tracked.gizmos[0].rect.width, tracked.gizmos[0].rect.height);
});

test("perspective tracking uses scale but never produces a trapezoid", () => {
  const geometry = { width: 300, height: 400, rotation: 0, mirrored: false };
  const gizmo = frame({ x: 0.2, y: 0.2, width: 0.45, height: 0.45 }).gizmos[0];
  const tracked = transformCompositionGizmo(
    gizmo,
    geometry,
    preview,
    [1, 0, 0, 0, 1, 0, 0.16, 0.08, 1],
  );
  assert.ok(Number.isFinite(tracked.rect.x));
  close(tracked.rect.width, tracked.rect.height);
});

test("tracking loss removes the guide instead of leaving a stale frame", () => {
  assert.equal(applyCompositionTracking(
    frame({ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }),
    emptyScene.geometry,
    preview,
    { lost: true, matrix: [] },
  ), null);
});

test("alignment uses four percent of the smaller preview side", () => {
  const aligned = getFramingAlignment(frame({ x: 0.31, y: 0.31, width: 0.4, height: 0.4 }), preview);
  assert.equal(aligned.aligned, true);
  close(aligned.tolerance, 12);
  const outside = getFramingAlignment(frame({ x: 0.36, y: 0.3, width: 0.4, height: 0.4 }), preview);
  assert.equal(outside.aligned, false);
});

test("alignment requires three consecutive updates and resets on drift", () => {
  let count = 0;
  for (const aligned of [true, true, false, true, true, true]) {
    const next = advanceAlignmentGate(count, aligned);
    count = next.count;
    if (aligned && count < 3) assert.equal(next.triggered, false);
  }
  assert.equal(advanceAlignmentGate(2, true).triggered, true);
  assert.deepEqual(advanceAlignmentGate(2, false), { count: 0, triggered: false });
});

test("zoom fills the frame and respects hardware limits", () => {
  close(calculateFramingZoom({ width: 0.5, height: 0.5 }, 1, 1, 5), 2);
  close(calculateFramingZoom({ width: 0.2, height: 0.2 }, 2, 1, 5), 5);
  close(calculateFramingZoom({ width: 0.8, height: 0.8 }, 0.5, 1, 5), 1);
});
