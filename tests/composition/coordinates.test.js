import test from "node:test";
import assert from "node:assert/strict";
import { createCompositionTransform } from "../../app/utils/compositionCoordinates.js";
import {
  ADVICE_COOLDOWN,
  LEVEL_ADVICE_COOLDOWN,
  createCompositionAdvisor,
  generateCompositionCandidates,
  generateCompositionResult,
} from "../../app/utils/compositionAnalysis.js";
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
  close(t.rect({ x: 0, y: 0.2, width: 0.1, height: 0.3 }).width, 0);
});

test("retro/safe-area offsets do not change preview-local coordinates", () => {
  const t = createCompositionTransform(portraitScene.geometry, { width: 270, height: 360, x: 15, y: 50 });
  const p = t.point({ x: 0.2, y: 0.7 });
  close(p.x, 0.2); close(p.y, 0.7);
});

test("invalid dimensions fail instead of returning NaN", () => {
  assert.throws(() => createCompositionTransform(portraitScene.geometry, { width: 0, height: 0 }));
});

test("ordinary portraits do not receive arbitrary thirds or weak level advice", () => {
  assert.deepEqual(generateCompositionResult(portraitScene, preview), {
    kind: "balanced", message: "Composição equilibrada", gizmos: [],
  });
  const centered = { ...emptyScene, people: [{ confidence: 1, rect: { x: 0.4, y: 0.2, width: 0.2, height: 0.65 } }] };
  const offThirds = { ...emptyScene, people: [{ confidence: 1, rect: { x: 0.55, y: 0.2, width: 0.2, height: 0.65 } }] };
  for (const scene of [centered, offThirds]) {
    assert.equal(generateCompositionResult(scene, preview).kind, "balanced");
  }
});

test("empty and weak observations return a balanced result", () => {
  assert.equal(generateCompositionResult(emptyScene, preview).kind, "balanced");
  const weak = {
    ...portraitScene,
    horizon: { angle: 1, confidence: 0.6 },
    people: portraitScene.people.map((person) => ({ ...person, confidence: 0.6 })),
    faces: [],
  };
  assert.equal(generateCompositionResult(weak, preview).kind, "balanced");
});

test("a group is framed as a whole and never gets a thirds target", () => {
  const scene = { ...emptyScene, people: [
    { confidence: 1, rect: { x: 0.05, y: 0.3, width: 0.15, height: 0.6 } },
    { confidence: 1, rect: { x: 0.5, y: 0.1, width: 0.45, height: 0.85 } },
  ], faces: [
    { confidence: 1, rect: { x: 0.04, y: 0.25, width: 0.2, height: 0.2 } },
    { confidence: 1, rect: { x: 0.75, y: 0.15, width: 0.1, height: 0.1 } },
  ] };
  assert.equal(generateCompositionCandidates(scene, preview).some((candidate) => candidate.gizmo.type === "target"), false);
});

test("double capture suggestions use the entire visible preview", () => {
  assert.deepEqual(
    generateCompositionResult(portraitScene, { ...preview, doubleCaptureMode: true }),
    generateCompositionResult(portraitScene, preview),
  );
});

test("landscape level guidance maps observations back to portrait UI", () => {
  const scene = {
    ...emptyScene,
    geometry: { width: 640, height: 480, rotation: 90, mirrored: false },
    horizon: { angle: 16 * Math.PI / 180, confidence: 1 },
  };
  const alignment = generateCompositionResult(scene, preview).gizmos[0];
  close(alignment.referenceAngle, Math.PI / 2);
  close(alignment.angle, Math.PI / 2 + 16 * Math.PI / 180);
});

test("level thresholds are contextual and require strong confidence", () => {
  const landscape = (degrees, confidence = 1) => ({
    ...emptyScene, horizon: { angle: degrees * Math.PI / 180, confidence },
  });
  const portrait = (degrees) => ({
    ...landscape(degrees), people: [{ confidence: 1, rect: { x: 0.4, y: 0.2, width: 0.2, height: 0.65 } }],
  });
  assert.equal(generateCompositionResult(landscape(9.9), preview).kind, "balanced");
  assert.equal(generateCompositionResult(landscape(10), preview).gizmos[0].type, "alignment");
  assert.equal(generateCompositionResult(landscape(16, 0.84), preview).kind, "balanced");
  assert.equal(generateCompositionResult(portrait(14.9), preview).kind, "balanced");
  assert.equal(generateCompositionResult(portrait(15), preview).gizmos[0].type, "alignment");
});

test("person close to an edge gets the highest-priority safety warning", () => {
  const scene = {
    ...emptyScene,
    horizon: { angle: 16 * Math.PI / 180, confidence: 1 },
    people: [{ confidence: 1, rect: { x: 0, y: 0.2, width: 0.25, height: 0.7 } }],
  };
  const result = generateCompositionResult(scene, preview);
  assert.equal(result.gizmos.length, 1);
  assert.equal(result.gizmos[0].type, "margin");
});

test("turned face gets look-space guidance in its direction", () => {
  const scene = { ...emptyScene, faces: [{ confidence: 1, yaw: 0.3, rect: { x: 0.72, y: 0.2, width: 0.15, height: 0.15 } }] };
  const look = generateCompositionResult(scene, preview).gizmos[0];
  assert.equal(look.type, "look-space");
  assert.equal(look.direction, "right");
});

test("generic saliency cannot invent edge, scale, or thirds guidance", () => {
  const scene = { ...emptyScene, subjects: [{ confidence: 1, rect: { x: 0.46, y: 0.46, width: 0.08, height: 0.08 } }] };
  assert.equal(generateCompositionResult(scene, preview).kind, "balanced");
  const edgeSaliency = {
    ...emptyScene,
    subjects: [{ confidence: 1, rect: { x: 0.5, y: 0, width: 0.5, height: 0.4 } }],
  };
  assert.equal(generateCompositionResult(edgeSaliency, preview).kind, "balanced");
});

test("generic saliency cannot outrank a valid horizon correction", () => {
  const scene = {
    ...emptyScene,
    horizon: { angle: 12 * Math.PI / 180, confidence: 1 },
    subjects: [{ confidence: 1, rect: { x: 0.5, y: 0, width: 0.5, height: 0.4 } }],
  };
  assert.equal(generateCompositionResult(scene, preview).gizmos[0].type, "alignment");
});

test("structural evidence can recommend symmetry without using thirds", () => {
  const scene = {
    ...emptyScene,
    subjects: [{ confidence: 0.9, rect: { x: 0.32, y: 0.3, width: 0.2, height: 0.3 } }],
    rectangles: [{ confidence: 0.95, rect: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 } }],
  };
  const result = generateCompositionResult(scene, preview);
  assert.equal(result.gizmos.length, 1);
  assert.equal(result.gizmos[0].type, "center");
});

test("advisor suppresses repetition, chooses an alternative, and expires cooldown", () => {
  let time = 1000;
  const advisor = createCompositionAdvisor({ now: () => time });
  const scene = {
    ...emptyScene,
    horizon: { angle: 16 * Math.PI / 180, confidence: 1 },
    people: [{ confidence: 1, rect: { x: 0, y: 0.25, width: 0.2, height: 0.7 } }],
  };
  assert.equal(advisor.generate(scene, preview).gizmos[0].type, "margin");
  assert.equal(advisor.generate(scene, preview).gizmos[0].type, "alignment");
  assert.deepEqual(advisor.generate(scene, preview), {
    kind: "no-new-advice", message: "Sem novas sugestões", gizmos: [],
  });
  time += ADVICE_COOLDOWN;
  assert.equal(advisor.generate(scene, preview).gizmos[0].type, "margin");
});

test("advisor reset clears recent advice", () => {
  const advisor = createCompositionAdvisor({ now: () => 1000 });
  const scene = { ...emptyScene, horizon: { angle: 12 * Math.PI / 180, confidence: 1 } };
  assert.equal(advisor.generate(scene, preview).kind, "advice");
  assert.equal(advisor.generate(scene, preview).kind, "no-new-advice");
  advisor.reset();
  assert.equal(advisor.generate(scene, preview).kind, "advice");
});

test("only the last three scans participate in repeat suppression", () => {
  const advisor = createCompositionAdvisor({ now: () => 1000 });
  const tilted = {
    ...emptyScene,
    people: [{ confidence: 1, rect: { x: 0, y: 0.2, width: 0.2, height: 0.7 } }],
  };
  assert.equal(advisor.generate(tilted, preview).kind, "advice");
  advisor.generate(emptyScene, preview);
  advisor.generate(emptyScene, preview);
  assert.equal(advisor.generate(tilted, preview).kind, "no-new-advice");
  advisor.generate(emptyScene, preview);
  assert.equal(advisor.generate(tilted, preview).kind, "advice");
});

test("level advice has a dedicated ninety-second cooldown", () => {
  let time = 1000;
  const advisor = createCompositionAdvisor({ now: () => time });
  const tilted = { ...emptyScene, horizon: { angle: 12 * Math.PI / 180, confidence: 1 } };
  assert.equal(advisor.generate(tilted, preview).kind, "advice");
  advisor.generate(emptyScene, preview);
  advisor.generate(emptyScene, preview);
  advisor.generate(emptyScene, preview);
  assert.equal(advisor.generate(tilted, preview).kind, "no-new-advice");
  time += LEVEL_ADVICE_COOLDOWN;
  assert.equal(advisor.generate(tilted, preview).kind, "advice");
});

test("MiniCPM keep suppresses generic deterministic advice", () => {
  const scene = {
    ...emptyScene,
    horizon: { angle: 20 * Math.PI / 180, confidence: 1 },
    judgement: { source: "minicpm-v-4.6", action: "keep", confidence: 0.91, message: "Mantenha" },
  };
  assert.deepEqual(generateCompositionResult(scene, preview), {
    kind: "balanced", message: "Composição equilibrada", gizmos: [],
  });
});

test("MiniCPM can return semantic advice without an invented rectangle", () => {
  const scene = {
    ...emptyScene,
    judgement: {
      source: "minicpm-v-4.6", action: "reduce_empty_space", confidence: 0.88,
      message: "Reduza o teto vazio",
    },
  };
  assert.deepEqual(generateCompositionResult(scene, preview), {
    kind: "advice", message: "Reduza o teto vazio", gizmos: [],
  });
});

test("MiniCPM level still requires strong confidence and a Vision horizon", () => {
  const judgement = {
    source: "minicpm-v-4.6", action: "level", confidence: 0.95, message: "Nivele a câmera",
  };
  assert.equal(generateCompositionResult({ ...emptyScene, judgement }, preview).kind, "balanced");
  const weakVote = {
    ...emptyScene,
    horizon: { angle: 20 * Math.PI / 180, confidence: 1 },
    judgement: { ...judgement, confidence: 0.89 },
  };
  assert.equal(generateCompositionResult(weakVote, preview).kind, "balanced");
  const strongVote = { ...weakVote, judgement };
  assert.equal(generateCompositionResult(strongVote, preview).gizmos[0].type, "alignment");
});

test("MiniCPM semantic advice participates in the session cooldown", () => {
  let time = 1000;
  const advisor = createCompositionAdvisor({ now: () => time });
  const scene = {
    ...emptyScene,
    judgement: {
      source: "minicpm-v-4.6", action: "simplify_background", confidence: 0.9,
      message: "Limpe o fundo atrás do rosto",
    },
  };
  assert.equal(advisor.generate(scene, preview).kind, "advice");
  assert.equal(advisor.generate(scene, preview).kind, "no-new-advice");
  time += ADVICE_COOLDOWN;
  assert.equal(advisor.generate(scene, preview).kind, "advice");
});
