import { createCompositionTransform } from "./compositionCoordinates.js";

export const COMPOSITION_MIN_CONFIDENCE = 0.7;
export const MAX_COMPOSITION_GIZMOS = 3;

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

function addCandidate(candidates, score, group, gizmo) {
  candidates.push({ score: clamp01(score), group, gizmo });
}

function selectCandidates(candidates) {
  const selected = [];
  const occupiedGroups = new Set();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (candidate.score < 0.46 || occupiedGroups.has(candidate.group)) continue;
    if (candidate.group === "placement" && occupiedGroups.has("look")) continue;
    if (candidate.group === "look" && occupiedGroups.has("placement")) continue;
    selected.push(candidate.gizmo);
    occupiedGroups.add(candidate.group);
    if (selected.length === MAX_COMPOSITION_GIZMOS) break;
  }
  return selected;
}

export function generateCompositionResult(analysis, preview) {
  const transform = createCompositionTransform(analysis.geometry, preview);
  const people = visibleSubjects(analysis.people, transform);
  const faces = visibleSubjects(analysis.faces, transform);
  const subjects = visibleSubjects(analysis.subjects, transform)
    .filter((subject) => !people.some((person) => contains(person.rect, center(subject.rect))));
  const rectangles = visibleSubjects(analysis.rectangles, transform);
  const scene = inferScene({ people, faces, subjects, rectangles });
  const primary = choosePrimary({ scene, people, faces, subjects, rectangles });
  const candidates = [];

  if (analysis.horizon?.confidence >= COMPOSITION_MIN_CONFIDENCE && Number.isFinite(analysis.horizon.angle)) {
    const tilt = ((analysis.horizon.angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    const tiltDegrees = Math.abs(tilt) * 180 / Math.PI;
    if (tiltDegrees >= 2) {
      const contextWeight = scene === "portrait" ? 0.88 : 1;
      addCandidate(candidates, (0.5 + Math.min(tiltDegrees, 12) / 24) * analysis.horizon.confidence * contextWeight, "level", {
        id: "alignment", type: "alignment", angle: transform.angle(tilt),
        referenceAngle: transform.angle(0), label: "Nivele a câmera",
      });
    }
  }

  if (primary) {
    const rect = primary.rect;
    const subjectArea = area(rect);
    const subjectCenter = center(rect);
    const edgeDistance = Math.min(rect.x, rect.y, 1 - rect.x - rect.width, 1 - rect.y - rect.height);
    if (edgeDistance <= 0.035) {
      addCandidate(candidates, 0.96 + Math.max(0, -edgeDistance), "framing", {
        id: `${primary.kind}-margin`, type: "margin", rect, label: "Afaste da borda",
      });
    }

    // A face box is not the full subject, so it cannot safely drive camera distance.
    const minUsefulArea = 0.035;
    const maxUsefulArea = scene === "group" ? 0.72 : 0.62;
    if (primary.kind !== "face" && subjectArea < minUsefulArea) {
      addCandidate(candidates, 0.76 + (minUsefulArea - subjectArea) * 3, "scale", {
        id: "scale-in", type: "scale", rect, direction: "in", label: "Aproxime",
      });
    } else if (subjectArea > maxUsefulArea) {
      addCandidate(candidates, 0.82 + (subjectArea - maxUsefulArea), "scale", {
        id: "scale-out", type: "scale", rect, direction: "out", label: "Afaste",
      });
    }

    const face = primary.face ?? (primary.kind === "face" ? primary : null);
    if (scene === "portrait" && face && Number.isFinite(face.yaw) && Math.abs(face.yaw) >= 0.12) {
      const lookingRight = face.yaw > 0;
      const availableLookSpace = lookingRight ? 1 - (face.rect.x + face.rect.width) : face.rect.x;
      if (availableLookSpace < 0.38) {
        addCandidate(candidates, 0.84 + Math.min(Math.abs(face.yaw), 0.5) * 0.2, "look", {
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
    if (symmetryEvidence && centeredDistance >= 0.035 && centeredDistance <= 0.19) {
      addCandidate(candidates, 0.72 + (0.19 - centeredDistance) * 0.5, "placement", {
        id: "center", type: "center", point: { x: 0.5, y: subjectCenter.y }, label: "Centralize para simetria",
      });
    } else if (scene !== "group") {
      const anchor = face ? center(face.rect) : subjectCenter;
      const targets = [
        { x: 1 / 3, y: 1 / 3 }, { x: 2 / 3, y: 1 / 3 },
        { x: 1 / 3, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
      ];
      const pixels = (point) => Math.hypot((point.x - anchor.x) * preview.width, (point.y - anchor.y) * preview.height);
      const target = targets.reduce((best, point) => pixels(point) < pixels(best) - 1e-8 ? point : best);
      const normalizedDistance = pixels(target) / Math.hypot(preview.width, preview.height);
      if (normalizedDistance >= 0.05) {
        addCandidate(candidates, 0.58 + Math.min(normalizedDistance, 0.25), "placement", {
          id: primary.kind === "subject" ? "generic-subject" : "subject", type: "target", point: target,
          label: primary.kind === "subject" ? "Mova o assunto aqui" : "Mova a pessoa aqui",
        });
      }
    }
  }

  return { gizmos: selectCandidates(candidates) };
}
