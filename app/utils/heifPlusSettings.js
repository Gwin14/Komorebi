// null preserves Apple's per-image calibration. Numeric values are RAW inputs.
const HEIF_PLUS_CONTROLS = [
  ["sharpnessAmount", "Nitidez", 0, 1, 0.01],
  ["luminanceNoiseReductionAmount", "Redução de ruído", 0, 1, 0.01],
  ["contrastAmount", "Clareza", 0, 1, 0.01],
  ["localToneMapAmount", "Equilíbrio de luz", 0, 1, 0.01],
  ["exposure", "Exposição (EV)", -3, 3, 0.1],
  ["boostAmount", "Curva global", 0, 1, 0.01],
  ["boostShadowAmount", "Sombras", 0, 2, 0.01],
  ["neutralTemperature", "Temperatura (K)", 2000, 50000, 100],
  ["neutralTint", "Matiz", -150, 150, 1],
  ["colorNoiseReductionAmount", "Ruído cromático", 0, 1, 0.01],
  ["detailAmount", "Detalhe", 0, 3, 0.01],
  ["moireReductionAmount", "Moiré", 0, 1, 0.01],
  ["despeckleAmount", "Despeckle", 0, 1, 0.01],
];
const DEFAULT_HEIF_PLUS_SETTINGS = Object.freeze({
  ...Object.fromEntries(HEIF_PLUS_CONTROLS.map(([key]) => [key, null])),
  // Gentle starting profile: retain texture without strong edge/local enhancement.
  sharpnessAmount: 0.15,
  luminanceNoiseReductionAmount: 0.15,
  contrastAmount: 0.05,
  localToneMapAmount: 0.15,
  exposure: 0,
  highlightRecoveryEnabled: true,
  lensCorrectionEnabled: null,
});
function normalizeHeifPlusSettings(value) {
  let source = value && typeof value === "object" ? value : {};
  // Upgrade the untouched legacy profile, while retaining custom/automatic choices.
  const untouchedLegacy = HEIF_PLUS_CONTROLS.every(([key]) =>
    source[key] === (key === "exposure" ? 0 : null))
    && source.highlightRecoveryEnabled === true && source.lensCorrectionEnabled === null;
  if (untouchedLegacy) source = {};
  const result = { ...DEFAULT_HEIF_PLUS_SETTINGS };
  for (const [key, , min, max] of HEIF_PLUS_CONTROLS) {
    if (source[key] === null) result[key] = null;
    else if (typeof source[key] === "number" && Number.isFinite(source[key])) {
      result[key] = Math.min(max, Math.max(min, source[key]));
    }
  }
  for (const key of ["highlightRecoveryEnabled", "lensCorrectionEnabled"]) {
    if (typeof source[key] === "boolean") result[key] = source[key];
  }
  return result;
}
function restorePhotoFormat(value, saveAsJpeg = false) {
  return ["heif", "heifPlus", "jpeg"].includes(value)
    ? value : saveAsJpeg ? "jpeg" : "heif";
}
function getHeifPlusPolicy({ photoFormat, rawMode = "off", capabilities,
  livePhotoEnabled, portraitModeEnabled, stackingEnabled, platform = "ios" }) {
  const requested = photoFormat === "heifPlus";
  const modes = capabilities?.supportedModes || ["off"];
  const selectedRaw = rawMode !== "off" && modes.includes(rawMode)
    ? rawMode : modes.includes("proRaw") ? "proRaw" : modes.includes("raw") ? "raw" : "off";
  const reason = platform !== "ios" ? "Disponível apenas no iOS"
    : livePhotoEnabled ? "Live Photo" : portraitModeEnabled ? "Retrato"
      : stackingEnabled ? "Stacking" : selectedRaw === "off" ? "Câmera sem RAW disponível" : null;
  return { requested, effective: requested && !reason,
    rawMode: requested && !reason ? selectedRaw : rawMode,
    suspensionReason: requested ? reason : null };
}
module.exports = { HEIF_PLUS_CONTROLS, DEFAULT_HEIF_PLUS_SETTINGS,
  normalizeHeifPlusSettings, restorePhotoFormat, getHeifPlusPolicy };
