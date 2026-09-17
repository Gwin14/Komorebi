import { createCompositionTransform } from "./compositionCoordinates.js";

export const COMPOSITION_MIN_CONFIDENCE = 0.7;
export const HORIZON_MIN_CONFIDENCE = 0.85;
export const MAX_COMPOSITION_GIZMOS = 1;
export const ADVICE_COOLDOWN = 30000;
export const ADVICE_HISTORY_LIMIT = 3;
export const LEVEL_ADVICE_COOLDOWN = 90000;
export const MODEL_ADVICE_MIN_CONFIDENCE = 0.72;
export const MODEL_LEVEL_MIN_CONFIDENCE = 0.9;

const PRIORITY = { framing: 5, look: 4, scale: 3, symmetry: 2, level: 1 };
const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const area = (rect) => rect.width * rect.height;
const contains = (rect, point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const distanceToCenter = (rect) => Math.hypot(center(rect).x - 0.5, center(rect).y - 0.5);

function visibleSubjects(items, transform) {
  return (items ?? [])
    .filter((item) => item.confidence >= COMPOSITION_MIN_CONFIDENCE &&
      [item.rect.x, item.rect.y, item.rect.width, item.rect.height].every(Number.isFinite) &&
      item.rect.width > 0 && item.rect.height > 0)
    .map((item) => ({ ...item, rect: transform.rect(item.rect) }))
    .filter((item) => area(item.rect) > 0)
    .sort((a, b) => area(b.rect) - area(a.rect) || distanceToCenter(a.rect) - distanceToCenter(b.rect));
}

function unionRects(items) {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.rect.x));
  const top = Math.min(...items.map((item) => item.rect.y));
  const right = Math.max(...items.map((item) => item.rect.x + item.rect.width));
  const bottom = Math.max(...items.map((item) => item.rect.y + item.rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function inferScene({ people, faces, subjects, rectangles }) {
  if (people.length > 1 || faces.length > 1) return "group";
  if (people.length || faces.length) return "portrait";
  if (rectangles.some((item) => area(item.rect) >= 0.16 && item.confidence >= 0.8)) return "architecture";
  if (subjects.length) return "subject";
  return "landscape";
}

function choosePrimary({ scene, people, faces, subjects, rectangles }) {
  if (scene === "group") {
    const members = people.length ? people : faces;
    const rect = unionRects(members);
    return rect ? { rect, confidence: Math.min(...members.map((item) => item.confidence)), kind: "group" } : null;
  }
  const person = people[0];
  const face = person ? faces.find((item) => contains(person.rect, center(item.rect))) : faces[0];
  if (person) return { ...person, kind: "person", face };
  if (face) return { ...face, kind: "face", face };
  if (subjects[0]) return { ...subjects[0], kind: "subject" };
  if (scene === "architecture" && rectangles[0]) return { ...rectangles[0], kind: "structure" };
  return null;
}

function addCandidate(candidates, category, severity, gizmo) {
  candidates.push({ category, priority: PRIORITY[category], severity: clamp01(severity), gizmo });
}

export function generateCompositionCandidates(analysis, preview) {
  const transform = createCompositionTransform(analysis.geometry, preview);
  const people = visibleSubjects(analysis.people, transform);
  const faces = visibleSubjects(analysis.faces, transform);
  const subjects = visibleSubjects(analysis.subjects, transform)
    .filter((subject) => !people.some((person) => contains(person.rect, center(subject.rect))));
  const rectangles = visibleSubjects(analysis.rectangles, transform);
  const scene = inferScene({ people, faces, subjects, rectangles });
  const primary = choosePrimary({ scene, people, faces, subjects, rectangles });
  const candidates = [];

  if (primary) {
    const rect = primary.rect;
    const subjectArea = area(rect);
    const subjectCenter = center(rect);
    const edgeDistance = Math.min(rect.x, rect.y, 1 - rect.x - rect.width, 1 - rect.y - rect.height);
    const hasReliableSubjectBounds = primary.kind === "person" || primary.kind === "face" || primary.kind === "group";

    if (hasReliableSubjectBounds && edgeDistance <= 0.025) {
      addCandidate(candidates, "framing", 0.9 + Math.max(0, -edgeDistance), {
        id: `${primary.kind}-margin`, type: "margin", rect, label: "Afaste da borda",
      });
    }

    // Face rectangles do not represent the subject's full scale.
    const minUsefulArea = 0.035;
    const maxUsefulArea = scene === "group" ? 0.72 : 0.62;
    if (hasReliableSubjectBounds && primary.kind !== "face" && subjectArea < minUsefulArea) {
      addCandidate(candidates, "scale", 0.7 + (minUsefulArea - subjectArea) * 3, {
        id: "scale-in", type: "scale", rect, direction: "in", label: "Aproxime",
      });
    } else if (hasReliableSubjectBounds && subjectArea > maxUsefulArea) {
      addCandidate(candidates, "scale", 0.78 + (subjectArea - maxUsefulArea), {
        id: "scale-out", type: "scale", rect, direction: "out", label: "Afaste",
      });
    }

    const face = primary.face ?? (primary.kind === "face" ? primary : null);
    if (scene === "portrait" && face && Number.isFinite(face.yaw) && Math.abs(face.yaw) >= 0.12) {
      const lookingRight = face.yaw > 0;
      const availableLookSpace = lookingRight ? 1 - (face.rect.x + face.rect.width) : face.rect.x;
      if (availableLookSpace < 0.38) {
        addCandidate(candidates, "look", 0.82 + Math.min(Math.abs(face.yaw), 0.5) * 0.2, {
          id: "look-space", type: "look-space",
          point: { x: lookingRight ? 2 / 3 : 1 / 3, y: center(face.rect).y },
          direction: lookingRight ? "right" : "left", label: "Dê espaço ao olhar",
        });
      }
    }

    const dominantRectangle = rectangles.find((item) => contains(item.rect, subjectCenter) || area(item.rect) >= 0.2);
    const centeredDistance = Math.abs(subjectCenter.x - 0.5);
    const aspect = rect.width / rect.height;
    const symmetryEvidence = scene === "architecture" || Boolean(dominantRectangle) ||
      (scene === "subject" && subjectArea >= 0.1 && aspect >= 0.65 && aspect <= 1.55);
    if (symmetryEvidence && centeredDistance >= 0.05 && centeredDistance <= 0.18) {
      addCandidate(candidates, "symmetry", 0.68 + (0.18 - centeredDistance), {
        id: "center", type: "center", point: { x: 0.5, y: subjectCenter.y }, label: "Centralize para simetria",
      });
    }
  }

  if (analysis.horizon?.confidence >= HORIZON_MIN_CONFIDENCE && Number.isFinite(analysis.horizon.angle)) {
    const tilt = ((analysis.horizon.angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    const tiltDegrees = Math.abs(tilt) * 180 / Math.PI;
    const threshold = scene === "portrait" || scene === "group" ? 15 : 10;
    if (tiltDegrees + 1e-9 >= threshold) {
      addCandidate(candidates, "level", 0.55 + Math.min(tiltDegrees - threshold, 12) / 24, {
        id: "alignment", type: "alignment", angle: transform.angle(tilt),
        referenceAngle: transform.angle(0), label: "Nivele a câmera",
      });
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority || b.severity - a.severity);
}

const makeResult = (kind, message, gizmos = []) => ({ kind, message, gizmos });

const MODEL_ACTIONS = {
  reframe: { category: "framing", fallback: "Reenquadre o assunto principal" },
  closer: { category: "scale", direction: "in", fallback: "Aproxime-se do assunto" },
  farther: { category: "scale", direction: "out", fallback: "Dê mais espaço ao assunto" },
  look_space: { category: "look", fallback: "Dê espaço na direção do olhar" },
  center_symmetry: { category: "symmetry", fallback: "Centralize a simetria da cena" },
  level: { category: "level", fallback: "Nivele a câmera" },
  reduce_empty_space: { category: "empty-space", fallback: "Reduza o espaço vazio dominante" },
  simplify_background: { category: "background", fallback: "Simplifique o fundo" },
  change_viewpoint: { category: "viewpoint", fallback: "Experimente outro ponto de vista" },
};

function normalizeModelMessage(message, fallback) {
  const clean = typeof message === "string" ? message.replace(/\s+/g, " ").trim() : "";
  return clean.length >= 4 ? clean.slice(0, 80) : fallback;
}

function candidateForJudgement(judgement, candidates) {
  if (!judgement || judgement.source !== "minicpm-v-4.6") return null;
  const confidence = Number(judgement.confidence);
  if (!Number.isFinite(confidence)) return { kind: "balanced" };
  if (judgement.action === "keep") return { kind: "balanced" };
  const definition = MODEL_ACTIONS[judgement.action];
  if (!definition || confidence < MODEL_ADVICE_MIN_CONFIDENCE) return { kind: "balanced" };

  const geometric = candidates.find((candidate) =>
    candidate.category === definition.category &&
    (!definition.direction || candidate.gizmo.direction === definition.direction));

  // MiniCPM can over-select `reframe` even when the subject is safely inside
  // the image. A reframe suggestion is only actionable when Vision also found
  // concrete crop/edge evidence, which additionally gives the overlay a useful
  // target instead of displaying a generic text-only instruction.
  if (judgement.action === "reframe" && !geometric) {
    return { kind: "balanced" };
  }

  // Level is deliberately stricter than every other model suggestion. It
  // needs both a strong semantic vote and Vision's high-confidence horizon.
  if (judgement.action === "level" &&
      (confidence < MODEL_LEVEL_MIN_CONFIDENCE || !geometric)) {
    return { kind: "balanced" };
  }

  const message = normalizeModelMessage(judgement.message, definition.fallback);
  if (geometric) return { kind: "candidate", candidate: geometric, message };
  return {
    kind: "candidate",
    candidate: { category: definition.category, priority: 0, severity: confidence, gizmo: null },
    message,
  };
}

export function createCompositionAdvisor({ now = Date.now } = {}) {
  let history = [];
  let lastLevelAdviceAt = -Infinity;
  const recordScan = (category, at) => {
    history = [...history, { category, at }].slice(-ADVICE_HISTORY_LIMIT);
  };

  return {
    reset() {
      history = [];
      lastLevelAdviceAt = -Infinity;
    },
    generate(analysis, preview) {
      const candidates = generateCompositionCandidates(analysis, preview);
      const timestamp = now();
      const modelChoice = candidateForJudgement(analysis.judgement, candidates);
      if (modelChoice?.kind === "balanced") {
        recordScan(null, timestamp);
        return makeResult("balanced", "Composição equilibrada");
      }
      if (!candidates.length) {
        if (modelChoice?.kind === "candidate") {
          const selected = modelChoice.candidate;
          const recentlyShown = history.some(
            (entry) => entry.category === selected.category && timestamp - entry.at < ADVICE_COOLDOWN,
          );
          if (recentlyShown) {
            recordScan(null, timestamp);
            return makeResult("no-new-advice", "Sem novas sugestões");
          }
          recordScan(selected.category, timestamp);
          return makeResult("advice", modelChoice.message);
        }
        recordScan(null, timestamp);
        return makeResult("balanced", "Composição equilibrada");
      }

      const selectable = modelChoice?.kind === "candidate" ? [modelChoice.candidate] : candidates;
      const selected = selectable.find((candidate) => {
        const recentlyShown = history.some(
          (entry) => entry.category === candidate.category && timestamp - entry.at < ADVICE_COOLDOWN,
        );
        const levelCoolingDown = candidate.category === "level" &&
          timestamp - lastLevelAdviceAt < LEVEL_ADVICE_COOLDOWN;
        return !recentlyShown && !levelCoolingDown;
      });
      if (!selected) {
        recordScan(null, timestamp);
        return makeResult("no-new-advice", "Sem novas sugestões");
      }

      recordScan(selected.category, timestamp);
      if (selected.category === "level") lastLevelAdviceAt = timestamp;
      const message = modelChoice?.message ?? selected.gizmo.label;
      return makeResult("advice", message, selected.gizmo ? [selected.gizmo] : []);
    },
  };
}

export function generateCompositionResult(analysis, preview) {
  return createCompositionAdvisor().generate(analysis, preview);
}
