// RAW and the processed photo can be selected independently, but never both off.
function toggleFileFormat(selection, target, supportedModes = ["off"]) {
  const preferredRaw = supportedModes.includes("proRaw") ? "proRaw"
    : supportedModes.includes("raw") ? "raw" : "off";
  if (target === "raw") {
    if (selection.rawMode !== "off") return { rawMode: "off", processedEnabled: true };
    return { ...selection, rawMode: preferredRaw };
  }
  if (!selection.processedEnabled) return { ...selection, processedEnabled: true };
  if (selection.rawMode === "off" && preferredRaw === "off") return selection;
  return { rawMode: selection.rawMode === "off" ? preferredRaw : selection.rawMode,
    processedEnabled: false };
}
module.exports = { toggleFileFormat };
