import { createCompositionTransform } from "./compositionCoordinates.js";

export const COMPOSITION_MIN_CONFIDENCE = 0.7;
export const MAX_COMPOSITION_GIZMOS = 3;
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const area = (r) => r.width * r.height;
const contains = (r, p) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

export function generateCompositionResult(analysis, preview) {
  const transform = createCompositionTransform(analysis.geometry, preview);
  const gizmos = [];
  if (analysis.horizon?.confidence >= COMPOSITION_MIN_CONFIDENCE && Number.isFinite(analysis.horizon.angle)) {
    // Undirected lines are equivalent modulo 180 degrees.
    const tilt = ((analysis.horizon.angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    if (Math.abs(tilt) >= 2 * Math.PI / 180) {
      gizmos.push({
        id: "alignment", type: "alignment", angle: transform.angle(tilt),
        referenceAngle: transform.angle(0), label: "Nivele a câmera",
      });
    }
  }
  const visibleSubjects = (subjects) => (subjects ?? [])
    .filter((s) => s.confidence >= COMPOSITION_MIN_CONFIDENCE &&
      [s.rect.x, s.rect.y, s.rect.width, s.rect.height].every(Number.isFinite) &&
      s.rect.width > 0 && s.rect.height > 0)
    .map((s) => ({ ...s, rect: transform.rect(s.rect) }))
    .filter((s) => area(s.rect) > 0)
    .sort((a, b) => area(b.rect) - area(a.rect) || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const people = visibleSubjects(analysis.people);
  const faces = visibleSubjects(analysis.faces);
  const subjects = visibleSubjects(analysis.subjects);
  const person = people[0];
  const face = person ? faces.find((f) => contains(person.rect, center(f.rect))) : faces[0];
  const personRect = person?.rect ?? face?.rect;
  const nearEdge = (rect, inset = 0.025) => rect.x <= inset || rect.y <= inset ||
    rect.x + rect.width >= 1 - inset || rect.y + rect.height >= 1 - inset;
  if (personRect && nearEdge(personRect)) {
    gizmos.unshift({ id: "person-margin", type: "margin", rect: personRect, label: "Afaste da borda" });
  }

  if (face && Number.isFinite(face.yaw) && Math.abs(face.yaw) >= 0.12) {
    const lookingRight = face.yaw > 0;
    gizmos.unshift({
      id: "look-space", type: "look-space",
      point: { x: lookingRight ? 2 / 3 : 1 / 3, y: center(face.rect).y },
      direction: lookingRight ? "right" : "left",
      label: "Dê espaço ao olhar",
    });
  }

  const genericSubject = subjects[0];
  if (!personRect && genericSubject && nearEdge(genericSubject.rect, 0.03)) {
    gizmos.unshift({ id: "subject-margin", type: "margin", rect: genericSubject.rect, label: "Afaste da borda" });
  }

  const scaleSubject = person ?? genericSubject;
  if (scaleSubject) {
    const subjectArea = area(scaleSubject.rect);
    if (subjectArea < 0.035) {
      gizmos.push({ id: "scale-in", type: "scale", rect: scaleSubject.rect, direction: "in", label: "Aproxime" });
    } else if (subjectArea > 0.62) {
      gizmos.push({ id: "scale-out", type: "scale", rect: scaleSubject.rect, direction: "out", label: "Afaste" });
    }
  }

  if (!personRect && genericSubject) {
    const subjectCenter = center(genericSubject.rect);
    const centeredDistance = Math.abs(subjectCenter.x - 0.5);
    const subjectArea = area(genericSubject.rect);
    const aspect = genericSubject.rect.width / genericSubject.rect.height;
    if (centeredDistance >= 0.04 && centeredDistance <= 0.18 && subjectArea >= 0.1 && aspect >= 0.65 && aspect <= 1.55) {
      gizmos.push({ id: "center", type: "center", point: { x: 0.5, y: subjectCenter.y }, label: "Centralize para simetria" });
    }
  }

  const subject = face ?? person ?? genericSubject;
  if (subject) {
    const origin = center(subject.rect);
    const candidates = [
      { x: 1 / 3, y: 1 / 3 }, { x: 2 / 3, y: 1 / 3 },
      { x: 1 / 3, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
    ];
    const distance = (p) => Math.hypot((p.x - origin.x) * preview.width, (p.y - origin.y) * preview.height);
    // Strict improvement preserves the top/left tie break despite float noise.
    const target = candidates.reduce((best, p) => distance(p) < distance(best) - 1e-8 ? p : best);
    if (distance(target) >= Math.hypot(preview.width, preview.height) * 0.05) {
      const generic = !face && !person;
      gizmos.push({
        id: generic ? "generic-subject" : "subject",
        type: "target", point: target,
        label: generic ? "Mova o assunto aqui" : "Mova a pessoa aqui",
      });
    }
  }
  return { gizmos: gizmos.slice(0, MAX_COMPOSITION_GIZMOS) };
}
