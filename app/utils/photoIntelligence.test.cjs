const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyPhotoIntelligenceToMetadata,
  buildIntelligentFilename,
  normalizePhotoIntelligence,
  sanitizeFilenameStem,
  sanitizeIntelligentTags,
} = require("./photoIntelligence");

test("normalizes, deduplicates and limits intelligent tags", () => {
  assert.deepEqual(
    sanitizeIntelligentTags([
      " Praia ", "praia", "Céu azul", "mar", "pessoa", "verão",
      "areia", "retrato", "luz natural", "extra",
    ]),
    ["praia", "céu azul", "mar", "pessoa", "verão", "areia", "retrato", "luz natural"],
  );
});

test("creates a portable descriptive filename with suffix and extension", () => {
  assert.equal(sanitizeFilenameStem(" Cão na Praia! "), "cao-na-praia");
  assert.equal(
    buildIntelligentFilename("Cão na Praia", {
      date: new Date(2026, 8, 24, 14, 32, 10),
      extension: ".HEIC",
      suffix: "Sem efeitos",
    }),
    "cao-na-praia_20260924-143210-sem-efeitos.heic",
  );
});

test("accepts a safe hyphenated model filename suggestion", () => {
  assert.equal(
    normalizePhotoIntelligence(
      { filenameStem: "cachorro-na-praia" },
      { generateFilename: true },
    ).filenameStem,
    "cachorro-na-praia",
  );
});

test("truncates a long model filename instead of discarding it", () => {
  assert.equal(
    normalizePhotoIntelligence(
      { filenameStem: "cachorro pequeno correndo feliz pela praia ao entardecer" },
      { generateFilename: true },
    ).filenameStem,
    "cachorro-pequeno-correndo-feliz-pela-praia",
  );
});

test("rejects prompt placeholders returned by the model", () => {
  assert.deepEqual(
    normalizePhotoIntelligence(
      {
        tags: ["tag 1", "tag 2", "tag 3", "tag 4", "tag 5", "tag 6"],
        filenameStem: "nome descritivo curto",
      },
      { generateTags: true, generateFilename: true },
    ),
    { tags: [], filenameStem: null, modelName: null },
  );
});

test("honors requested outputs and enriches metadata compatibly", () => {
  const intelligence = normalizePhotoIntelligence(
    {
      tags: ["Flor", "flor", "jardim", "natureza", "amarelo", "luz natural"],
      filenameStem: "Flor amarela",
      modelName: "MiniCPM",
    },
    { generateTags: true, generateFilename: false },
  );
  assert.deepEqual(intelligence.tags, [
    "flor", "jardim", "natureza", "amarelo", "luz natural",
  ]);
  assert.equal(intelligence.filenameStem, null);

  const oldMetadata = { app: "Komorebi", schemaVersion: 3, captureMode: "standard" };
  const enriched = applyPhotoIntelligenceToMetadata(oldMetadata, intelligence);
  assert.equal(enriched.schemaVersion, 4);
  assert.deepEqual(enriched.intelligence.tags, [
    "flor", "jardim", "natureza", "amarelo", "luz natural",
  ]);
  assert.equal(oldMetadata.schemaVersion, 3);
});

test("rejects incomplete model outputs independently", () => {
  assert.deepEqual(
    normalizePhotoIntelligence(
      { tags: ["praia", "mar", "sol"], filenameStem: "Praia" },
      { generateTags: true, generateFilename: true },
    ),
    { tags: [], filenameStem: null, modelName: null },
  );
  assert.equal(
    normalizePhotoIntelligence(
      { tags: ["praia", "mar", "sol", "areia", "verão"], filenameStem: "Cão na praia" },
      { generateTags: true, generateFilename: true },
    ).filenameStem,
    "cao-na-praia",
  );
});

test("keeps old metadata unchanged when the model returns no usable result", () => {
  const metadata = { app: "Komorebi", schemaVersion: 3 };
  assert.equal(applyPhotoIntelligenceToMetadata(metadata, {}), metadata);
});
