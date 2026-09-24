const MAX_TAGS = 8;
const MAX_FILENAME_STEM_LENGTH = 56;

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeIntelligentTags = (values) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) =>
      normalizeWhitespace(value)
        .toLocaleLowerCase("pt-BR")
        .replace(/^[\s#.,;:'"`]+|[\s#.,;:'"`]+$/g, ""),
    )
    .filter((value) => {
      if (
        !value ||
        value.length > 40 ||
        /^tag\s*\d+$/i.test(value) ||
        seen.has(value)
      ) return false;
      seen.add(value);
      return true;
    })
    .slice(0, MAX_TAGS);
};

const normalizeFilenameSuggestion = (value) => {
  const words = normalizeWhitespace(value).split(/[\s_-]+/).filter(Boolean);
  if (words.length < 2) return null;
  const suggestion = words.slice(0, 6).join(" ");
  const normalized = suggestion.toLocaleLowerCase("pt-BR");
  if (["nome descritivo", "nome descritivo curto"].includes(normalized)) {
    return null;
  }
  return suggestion;
};

const sanitizeFilenameStem = (value) => {
  const normalized = normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILENAME_STEM_LENGTH)
    .replace(/-+$/g, "");
  return normalized || null;
};

const formatFilenameTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const normalizeExtension = (extension) => {
  const value = String(extension ?? "jpg")
    .toLowerCase()
    .replace(/^\./, "")
    .replace(/[^a-z0-9]/g, "");
  return value || "jpg";
};

const buildIntelligentFilename = (
  filenameStem,
  { date = new Date(), extension = "jpg", suffix = null } = {},
) => {
  const stem = sanitizeFilenameStem(filenameStem);
  if (!stem) return null;
  const cleanSuffix = sanitizeFilenameStem(suffix);
  return `${stem}_${formatFilenameTimestamp(date)}${cleanSuffix ? `-${cleanSuffix}` : ""}.${normalizeExtension(extension)}`;
};

const normalizePhotoIntelligence = (
  result,
  { generateTags = false, generateFilename = false } = {},
) => {
  const tags = generateTags ? sanitizeIntelligentTags(result?.tags) : [];
  const filenameSuggestion = generateFilename
    ? normalizeFilenameSuggestion(result?.filenameStem)
    : null;
  const filenameStem = filenameSuggestion
    ? sanitizeFilenameStem(filenameSuggestion)
    : null;
  return {
    tags: tags.length >= 5 ? tags : [],
    filenameStem,
    modelName: normalizeWhitespace(result?.modelName) || null,
  };
};

const applyPhotoIntelligenceToMetadata = (
  metadata,
  intelligence,
  suggestedFilename = null,
) => {
  if (!metadata || metadata.app !== "Komorebi") return metadata;
  const tags = sanitizeIntelligentTags(intelligence?.tags);
  const filenameStem = sanitizeFilenameStem(intelligence?.filenameStem);
  if (!tags.length && !filenameStem) return metadata;

  return {
    ...metadata,
    schemaVersion: Math.max(Number(metadata.schemaVersion) || 0, 4),
    intelligence: {
      model: normalizeWhitespace(intelligence?.modelName) || undefined,
      tags,
      filenameStem: filenameStem || undefined,
      suggestedFilename: suggestedFilename || undefined,
    },
  };
};

module.exports = {
  applyPhotoIntelligenceToMetadata,
  buildIntelligentFilename,
  normalizePhotoIntelligence,
  sanitizeFilenameStem,
  sanitizeIntelligentTags,
};
