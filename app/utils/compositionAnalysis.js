import { createCompositionTransform } from "./compositionCoordinates.js";

export const COMPOSITION_MIN_CONFIDENCE = 0.7;
export const ADVICE_COOLDOWN = 30000;
export const ADVICE_HISTORY_LIMIT = 3;
export const LEVEL_ADVICE_COOLDOWN = 90000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const area = (rect) => rect.width * rect.height;
const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const contains = (rect, point) => point && point.x >= rect.x && point.x <= rect.x + rect.width &&
  point.y >= rect.y && point.y <= rect.y + rect.height;
const centerDistance = (rect, point) => {
  const rectCenter = center(rect);
  return Math.hypot(rectCenter.x - point.x, rectCenter.y - point.y);
};

function visibleSubjects(items, transform, minConfidence = COMPOSITION_MIN_CONFIDENCE) {
  return (items ?? [])
    .filter((item) => item.confidence >= minConfidence &&
      [item.rect?.x, item.rect?.y, item.rect?.width, item.rect?.height].every(Number.isFinite) &&
      item.rect.width > 0 && item.rect.height > 0)
    .map((item) => ({ ...item, rect: transform.rect(item.rect) }))
    .filter((item) => area(item.rect) > 0)
    .sort((a, b) => area(b.rect) - area(a.rect));
}

function unionRects(items) {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.rect.x));
  const top = Math.min(...items.map((item) => item.rect.y));
  const right = Math.max(...items.map((item) => item.rect.x + item.rect.width));
  const bottom = Math.max(...items.map((item) => item.rect.y + item.rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sceneSubject(analysis, transform, preferredPoint) {
  const people = visibleSubjects(analysis.people, transform);
  const faces = visibleSubjects(analysis.faces, transform);
  // Attention saliency confidence is not calibrated like object detection.
  // A lower threshold keeps useful compact regions without weakening people/face checks.
  const subjects = visibleSubjects(analysis.subjects, transform, 0.3);
  const rectangles = visibleSubjects(analysis.rectangles, transform);
  if (preferredPoint) {
    for (const [kind, items] of [
      ["face", faces], ["person", people], ["subject", subjects], ["architecture", rectangles],
    ]) {
      const hit = items.filter((item) => contains(item.rect, preferredPoint))
        .sort((a, b) => area(a.rect) - area(b.rect))[0];
      if (hit) return { kind, rect: hit.rect, selected: true };
    }
    const nearest = [
      ...faces.map((item) => ({ kind: "face", ...item })),
      ...people.map((item) => ({ kind: "person", ...item })),
      ...subjects.map((item) => ({ kind: "subject", ...item })),
      ...rectangles.map((item) => ({ kind: "architecture", ...item })),
    ].sort((a, b) => centerDistance(a.rect, preferredPoint) - centerDistance(b.rect, preferredPoint))[0];
    if (nearest && centerDistance(nearest.rect, preferredPoint) <= 0.22) {
      return { kind: nearest.kind, rect: nearest.rect, selected: true };
    }
  }
  if (people.length > 1) return { kind: "group", rect: unionRects(people) };
  if (people[0]) return { kind: "person", rect: people[0].rect };
  if (faces.length > 1) return { kind: "group", rect: unionRects(faces) };
  if (faces[0]) return { kind: "face", rect: faces[0].rect };
  if (subjects[0]) return { kind: "subject", rect: subjects[0].rect };
  if (rectangles[0]) return { kind: "architecture", rect: rectangles[0].rect };
  return null;
}

function fixedAspectRect(bounds, padding = 1, { minSize = 0.22, maxSize = 0.74 } = {}) {
  const subjectCenter = center(bounds);
  const size = clamp(Math.max(bounds.width, bounds.height) * padding, minSize, maxSize);
  const centerX = clamp(subjectCenter.x, size / 2, 1 - size / 2);
  const centerY = clamp(subjectCenter.y, size / 2, 1 - size / 2);
  return { x: centerX - size / 2, y: centerY - size / 2, width: size, height: size };
}

function modelBounds(frame, transform, preferredPoint) {
  const centerX = Number(frame?.centerX);
  const centerY = Number(frame?.centerY);
  const width = Number(frame?.width ?? frame?.size);
  const height = Number(frame?.height ?? frame?.size);
  if (![centerX, centerY, width, height].every(Number.isFinite) ||
      width < 40 || width > 900 || height < 40 || height > 900 ||
      centerX - width / 2 < 0 || centerX + width / 2 > 1000 ||
      centerY - height / 2 < 0 || centerY + height / 2 > 1000) return null;
  // Older prompts contained this exact sample. MiniCPM sometimes echoed it
  // verbatim for unrelated scenes, creating the same large frame every time.
  if (Math.abs(centerX - 500) <= 2 && Math.abs(centerY - 450) <= 2 &&
      Math.abs(width - 600) <= 2 && Math.abs(height - 760) <= 2) return null;
  const rect = transform.rect({
    x: (centerX - width / 2) / 1000,
    y: (centerY - height / 2) / 1000,
    width: width / 1000,
    height: height / 1000,
  });
  return preferredPoint && !contains(rect, preferredPoint) ? null : rect;
}

function concreteSubjectLabel(value) {
  if (typeof value !== "string") return "";
  const label = value.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const generic = /^(a |o |as |os |um |uma )?(cena|assunto|elemento|ambiente|paisagem|composicao|principal)$/u;
  return label.length >= 3 && label.length <= 24 && label.split(" ").length <= 3 && !generic.test(normalized)
    ? label
    : "";
}

function cropSettings(value) {
  if (value === "tight") return { padding: 1.08, minSize: 0.2, maxSize: 0.48 };
  if (value === "wide") return { padding: 1.45, minSize: 0.3, maxSize: 0.76 };
  return { padding: 1.22, minSize: 0.24, maxSize: 0.62 };
}

function messageFor(analysis, subject, hasSelection) {
  const subjectLabel = concreteSubjectLabel(analysis.judgement?.subject);
  if (subjectLabel) return `Enquadrar ${subjectLabel}`.slice(0, 48);
  if (subject?.kind === "group") return "Enquadrar o grupo";
  if (subject?.kind === "person") return "Enquadrar a pessoa";
  if (subject?.kind === "face") return "Enquadrar o rosto";
  if (subject?.kind === "architecture") return "Enquadrar a estrutura";
  if (subject) return "Enquadrar o assunto";
  if (hasSelection) return "Enquadrar a seleção";
  return "Recortar a cena";
}

function buildResult(analysis, preview, context = {}) {
  const transform = createCompositionTransform(analysis.geometry, preview);
  const selectedPoint = context.subjectPoint;
  const subject = sceneSubject(analysis, transform, selectedPoint);
  const suggested = modelBounds(analysis.judgement?.frame, transform, selectedPoint);
  const crop = cropSettings(analysis.judgement?.cropIntent);
  const compactVisionSubject = subject && (
    ["person", "group", "face"].includes(subject.kind) ||
    (subject.kind === "subject" && area(subject.rect) <= 0.45)
  );
  const selectedVisionSubject = Boolean(subject?.selected) && (
    ["person", "group", "face"].includes(subject.kind) || area(subject.rect) <= 0.55
  );
  const subjectPadding = subject?.kind === "face"
    ? Math.max(1.6, crop.padding)
    : crop.padding;
  const pointFallback = selectedPoint
    ? fixedAspectRect({
      x: selectedPoint.x - 0.2,
      y: selectedPoint.y - 0.2,
      width: 0.4,
      height: 0.4,
    }, 1, { minSize: 0.4, maxSize: 0.4 })
    : null;
  const selectedModelFrame = suggested && Math.max(suggested.width, suggested.height) <= crop.maxSize
    ? fixedAspectRect(suggested, crop.padding, crop)
    : null;
  const rect = selectedVisionSubject
    ? fixedAspectRect(subject.rect, subjectPadding, crop)
    : selectedPoint
      ? selectedModelFrame ?? pointFallback
      : compactVisionSubject
        ? fixedAspectRect(subject.rect, subjectPadding, crop)
        : suggested
          ? fixedAspectRect(suggested, crop.padding, crop)
          : subject
            ? fixedAspectRect(subject.rect, subjectPadding, crop)
            : { x: 0.14, y: 0.14, width: 0.72, height: 0.72 };
  const message = messageFor(analysis, subject, Boolean(selectedPoint));
  const subjectTopic = concreteSubjectLabel(analysis.judgement?.subject) || subject?.kind;
  return {
    kind: "advice",
    message,
    topic: subjectTopic || (selectedPoint ? "seleção" : "cena"),
    gizmos: [{
      id: "composition-frame",
      type: "framing",
      rect,
      label: message,
      anchor: "scene",
    }],
  };
}

export function generateCompositionCandidates(analysis, preview, context) {
  const result = buildResult(analysis, preview, context);
  return [{
    category: "framing",
    topic: result.topic,
    priority: 1,
    severity: 1,
    gizmo: result.gizmos[0],
  }];
}

export function createCompositionAdvisor() {
  let history = [];
  return {
    reset() { history = []; },
    context() {
      return { recentAdvice: history.map(({ topic, message }) => ({ topic, message })) };
    },
    generate(analysis, preview, context) {
      const result = buildResult(analysis, preview, context);
      history = [...history, { topic: result.topic, message: result.message }].slice(-ADVICE_HISTORY_LIMIT);
      return result;
    },
  };
}

export function generateCompositionResult(analysis, preview, context) {
  return createCompositionAdvisor().generate(analysis, preview, context);
}
