import { createCompositionTransform } from "./compositionCoordinates.js";

export const COMPOSITION_MIN_CONFIDENCE = 0.7;
export const ADVICE_COOLDOWN = 30000;
export const ADVICE_HISTORY_LIMIT = 3;
export const LEVEL_ADVICE_COOLDOWN = 90000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const area = (rect) => rect.width * rect.height;
const center = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

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

function sceneSubject(analysis, transform) {
  const people = visibleSubjects(analysis.people, transform);
  const faces = visibleSubjects(analysis.faces, transform);
  // Attention saliency confidence is not calibrated like object detection.
  // A lower threshold keeps useful compact regions without weakening people/face checks.
  const subjects = visibleSubjects(analysis.subjects, transform, 0.3);
  const rectangles = visibleSubjects(analysis.rectangles, transform);
  if (people.length > 1) return { kind: "group", rect: unionRects(people) };
  if (people[0]) return { kind: "person", rect: people[0].rect };
  if (faces.length > 1) return { kind: "group", rect: unionRects(faces) };
  if (faces[0]) return { kind: "face", rect: faces[0].rect };
  if (subjects[0]) return { kind: "subject", rect: subjects[0].rect };
  if (rectangles[0]) return { kind: "architecture", rect: rectangles[0].rect };
  return null;
}

function fixedAspectRect(bounds, padding = 1) {
  const subjectCenter = center(bounds);
  const size = clamp(Math.max(bounds.width, bounds.height) * padding, 0.24, 0.9);
  const centerX = clamp(subjectCenter.x, size / 2, 1 - size / 2);
  const centerY = clamp(subjectCenter.y, size / 2, 1 - size / 2);
  return { x: centerX - size / 2, y: centerY - size / 2, width: size, height: size };
}

function modelBounds(frame, transform) {
  const centerX = Number(frame?.centerX);
  const centerY = Number(frame?.centerY);
  const width = Number(frame?.width ?? frame?.size);
  const height = Number(frame?.height ?? frame?.size);
  if (![centerX, centerY, width, height].every(Number.isFinite) ||
      width < 120 || width > 900 || height < 120 || height > 900 ||
      centerX - width / 2 < 0 || centerX + width / 2 > 1000 ||
      centerY - height / 2 < 0 || centerY + height / 2 > 1000) return null;
  // Older prompts contained this exact sample. MiniCPM sometimes echoed it
  // verbatim for unrelated scenes, creating the same large frame every time.
  if (Math.abs(centerX - 500) <= 2 && Math.abs(centerY - 450) <= 2 &&
      Math.abs(width - 600) <= 2 && Math.abs(height - 760) <= 2) return null;
  return transform.rect({
    x: (centerX - width / 2) / 1000,
    y: (centerY - height / 2) / 1000,
    width: width / 1000,
    height: height / 1000,
  });
}

const TOPIC_MESSAGES = {
  luz: "Equilibrar a luz",
  fundo: "Simplificar o fundo",
  enquadramento: "Destacar o assunto",
  escala: "Valorizar o assunto",
  perspectiva: "Melhorar a perspectiva",
  olhar: "Dar espaço ao olhar",
  simetria: "Reforçar a simetria",
  "nível": "Equilibrar o horizonte",
  cor: "Valorizar as cores",
  "espaço vazio": "Reduzir espaço vazio",
  "relações": "Separar os elementos",
  profundidade: "Criar profundidade",
  retrato: "Destacar a pessoa",
};

const SEMANTIC_TOPIC_MESSAGES = [
  [/(planta|plantas|veget|flower)/u, "Destacar as plantas"],
  [/(pessoa|people|person|retrato|rosto)/u, "Destacar a pessoa"],
  [/(crate|caixa|objeto|object)/u, "Destacar o objeto"],
  [/(trabalho|workspace|industrial|interior)/u, "Organizar o espaço"],
  [/(linha|forma|arquitet|building|pr[eé]dio)/u, "Valorizar as linhas"],
  [/(luz|light|sombra|shadow|contraste)/u, "Equilibrar a luz"],
  [/(profund|depth|perspect)/u, "Criar profundidade"],
  [/(fundo|background)/u, "Simplificar o fundo"],
];

function normalizeTopic(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR").slice(0, 48)
    : "";
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

function sceneFallbackMessage(analysis, subject) {
  const rectangles = (analysis.rectangles ?? []).filter((item) => item.confidence >= COMPOSITION_MIN_CONFIDENCE);
  if (rectangles.length >= 2) return "Valorizar as linhas";
  if (analysis.horizon?.confidence >= 0.85 && Math.abs(analysis.horizon.angle) >= 0.04) {
    return "Equilibrar o horizonte";
  }
  if (rectangles.length === 1) return "Organizar as formas";
  if (subject) return "Destacar o assunto";
  return "Preservar o equilíbrio";
}

function messageFor(analysis, subject, subjectDriven = false) {
  const judgement = analysis.judgement;
  const subjectLabel = concreteSubjectLabel(judgement?.subject);
  if (subjectDriven) {
    if (subject?.kind === "group") return "Enquadrar o grupo";
    if (subject?.kind === "person") return "Destacar a pessoa";
    if (subject?.kind === "face") return "Destacar o rosto";
    if (subjectLabel && subject?.kind === "subject") return `Destacar ${subjectLabel}`.slice(0, 48);
  }
  const topic = normalizeTopic(judgement?.topic);
  const normalizedTopic = topic.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const proposed = typeof judgement?.message === "string"
    ? judgement.message.replace(/\s+/g, " ").trim()
    : "";
  const nominal = /^(destacar|reduzir|preservar|equilibrar|simplificar|valorizar|melhorar|dar|refor[cç]ar|criar|separar|enquadrar|organizar|suavizar)\b/iu;
  const rejected = /\b(clarity|lighting|background|technical|metadados?|frame|hint|topic)\b/iu;
  if (proposed.length >= 4 && proposed.length <= 48 && nominal.test(proposed) && !rejected.test(proposed)) {
    return proposed;
  }
  const matchingTopic = Object.keys(TOPIC_MESSAGES).find((key) =>
    new RegExp(`(^|\\s)${key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}($|\\s)`, "u")
      .test(normalizedTopic));
  if (matchingTopic) return TOPIC_MESSAGES[matchingTopic];
  const semanticText = `${normalizedTopic} ${proposed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
  const semanticMatch = SEMANTIC_TOPIC_MESSAGES.find(([pattern]) => pattern.test(semanticText));
  if (semanticMatch) return semanticMatch[1];
  if (subject?.kind === "group") return "Enquadrar o grupo";
  if (subject?.kind === "person") return "Destacar a pessoa";
  if (subject?.kind === "face") return "Destacar o rosto";
  if (subject?.kind === "architecture") return "Valorizar a arquitetura";
  return sceneFallbackMessage(analysis, subject);
}

function buildResult(analysis, preview) {
  const transform = createCompositionTransform(analysis.geometry, preview);
  const subject = sceneSubject(analysis, transform);
  const suggested = modelBounds(analysis.judgement?.frame, transform);
  const compactVisionSubject = subject && (
    ["person", "group", "face"].includes(subject.kind) ||
    (subject.kind === "subject" && area(subject.rect) <= 0.45)
  );
  const padding = subject?.kind === "face" ? 2.2 : subject?.kind === "subject" ? 1.18 : 1.3;
  const rect = compactVisionSubject
    ? fixedAspectRect(subject.rect, padding)
    : suggested
      ? fixedAspectRect(suggested)
      : subject
        ? fixedAspectRect(subject.rect, padding)
        : { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const message = messageFor(analysis, subject, Boolean(compactVisionSubject));
  const subjectTopic = concreteSubjectLabel(analysis.judgement?.subject) || subject?.kind;
  return {
    kind: analysis.judgement?.verdict === "advice" ? "advice" : "balanced",
    message,
    topic: compactVisionSubject
      ? subjectTopic || "assunto"
      : normalizeTopic(analysis.judgement?.topic) || subject?.kind || "equilíbrio",
    gizmos: [{
      id: "composition-frame",
      type: "framing",
      rect,
      label: message,
      anchor: "scene",
    }],
  };
}

export function generateCompositionCandidates(analysis, preview) {
  const result = buildResult(analysis, preview);
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
    generate(analysis, preview) {
      const result = buildResult(analysis, preview);
      history = [...history, { topic: result.topic, message: result.message }].slice(-ADVICE_HISTORY_LIMIT);
      return result;
    },
  };
}

export function generateCompositionResult(analysis, preview) {
  return createCompositionAdvisor().generate(analysis, preview);
}
