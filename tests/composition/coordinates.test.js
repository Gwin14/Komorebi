import test from "node:test";
import assert from "node:assert/strict";
import { createCompositionTransform } from "../../app/utils/compositionCoordinates.js";
import { generateCompositionResult } from "../../app/utils/compositionAnalysis.js";
import { portraitScene, emptyScene } from "./fixtures.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const preview = { width: 300, height: 400, mirrored: false };

test("portrait back camera preserves asymmetric coordinates", () => {
  const p = createCompositionTransform(portraitScene.geometry, preview).point({ x: 0.2, y: 0.7 });
  close(p.x, 0.2); close(p.y, 0.7);
});
test("front preview mirrors once, including line inclination", () => {
  const t = createCompositionTransform(portraitScene.geometry, { ...preview, mirrored: true });
  close(t.point({ x: 0.2, y: 0.7 }).x, 0.8);
  close(t.angle(0.1), -0.1);
  const alreadyMirrored = createCompositionTransform({ ...portraitScene.geometry, mirrored: true }, { ...preview, mirrored: true });
  close(alreadyMirrored.point({ x: 0.2, y: 0.7 }).x, 0.2);
});
for (const [rotation, x, y] of [[90, 0.3, 0.2], [180, 0.8, 0.3], [270, 0.7, 0.8]]) {
  test(`rotation ${rotation} transforms asymmetric coordinates`, () => {
    const geometry = { width: 100, height: 100, rotation };
    const p = createCompositionTransform(geometry, { width: 100, height: 100 }).point({ x: 0.2, y: 0.7 });
    close(p.x, x); close(p.y, y);
  });
}
test("cover crops sides for 9:16 and clips subjects outside preview", () => {
  const t = createCompositionTransform(portraitScene.geometry, { width: 225, height: 400 });
  close(t.point({ x: 0.125, y: 0 }).x, 0);
  close(t.point({ x: 0.875, y: 1 }).x, 1);
  assert.equal(t.rect({ x: 0, y: 0.2, width: 0.1, height: 0.3 }).width, 0);
});
test("retro/safe-area offsets do not change preview-local coordinates", () => {
  const t = createCompositionTransform(portraitScene.geometry, { width: 270, height: 360, x: 15, y: 50 });
  const p = t.point({ x: 0.2, y: 0.7 });
  close(p.x, 0.2); close(p.y, 0.7);
});
test("invalid dimensions fail instead of returning NaN", () => {
  assert.throws(() => createCompositionTransform(portraitScene.geometry, { width: 0, height: 0 }));
});
test("real scene produces only curated alignment and target", () => {
  const { gizmos } = generateCompositionResult(portraitScene, preview);
  assert.deepEqual(gizmos.map((g) => g.type), ["alignment", "target"]);
  assert.deepEqual(gizmos[1].point, { x: 2 / 3, y: 1 / 3 });
  assert.equal("confidence" in gizmos[0], false);
});
test("empty and weak observations never create placeholder suggestions", () => {
  assert.deepEqual(generateCompositionResult(emptyScene, preview), { gizmos: [] });
  const weak = { ...portraitScene, horizon: { angle: 1, confidence: 0.6 }, people: portraitScene.people.map((p) => ({ ...p, confidence: 0.6 })), faces: [] };
  assert.deepEqual(generateCompositionResult(weak, preview), { gizmos: [] });
});
test("small tilt and a subject already at a third are omitted", () => {
  const scene = { ...emptyScene, horizon: { angle: Math.PI / 180, confidence: 1 }, faces: [{ confidence: 1, rect: { x: 1 / 3 - 0.05, y: 1 / 3 - 0.05, width: 0.1, height: 0.1 } }] };
  assert.deepEqual(generateCompositionResult(scene, preview), { gizmos: [] });
});
test("center subject ties prefer upper left", () => {
  const scene = { ...emptyScene, people: [{ confidence: 1, rect: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 } }] };
  assert.deepEqual(generateCompositionResult(scene, preview).gizmos[0].point, { x: 1 / 3, y: 1 / 3 });
});
test("largest visible person wins and only associated face supplies anchor", () => {
  const scene = { ...emptyScene, people: [
    { confidence: 1, rect: { x: 0.05, y: 0.3, width: 0.15, height: 0.6 } },
    { confidence: 1, rect: { x: 0.5, y: 0.1, width: 0.45, height: 0.85 } },
  ], faces: [
    { confidence: 1, rect: { x: 0.04, y: 0.25, width: 0.2, height: 0.2 } },
    { confidence: 1, rect: { x: 0.75, y: 0.15, width: 0.1, height: 0.1 } },
  ] };
  assert.deepEqual(generateCompositionResult(scene, preview).gizmos[0].point, { x: 2 / 3, y: 1 / 3 });
});
test("double capture suggestions use the entire visible preview", () => {
  assert.deepEqual(generateCompositionResult(portraitScene, { ...preview, doubleCaptureMode: true }), generateCompositionResult(portraitScene, preview));
});

test("landscape scene maps upright observations and level reference back to portrait UI", () => {
  const scene = { ...portraitScene, geometry: { width: 640, height: 480, rotation: 90, mirrored: false } };
  const { gizmos } = generateCompositionResult(scene, preview);
  const alignment = gizmos.find((g) => g.type === "alignment");
  close(alignment.referenceAngle, Math.PI / 2);
  close(alignment.angle, Math.PI / 2 + 0.1);
  const levelScene = { ...scene, horizon: { angle: 0, confidence: 1 }, people: [], faces: [] };
  assert.deepEqual(generateCompositionResult(levelScene, preview), { gizmos: [] });
});
