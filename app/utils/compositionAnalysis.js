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
        referenceAngle: transform.angle(0),
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
  const person = people[0];
  const face = person ? faces.find((f) => contains(person.rect, center(f.rect))) : faces[0];
  const subject = face ?? person;
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
      gizmos.push({ id: "subject", type: "target", point: target });
    }
  }
  return { gizmos: gizmos.slice(0, MAX_COMPOSITION_GIZMOS) };
}
