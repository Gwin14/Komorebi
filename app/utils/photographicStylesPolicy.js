// Styles belong to the rendered HEIF, never to the sensor data in a DNG.
const getAppleStylesSuspensionReason = ({
  livePhotoEnabled = false,
  rawMode = "off",
  heifPlusEnabled = false,
} = {}) => {
  // The still Styles graph does not yet provide a working Live Photo editor.
  if (livePhotoEnabled) return "Live Photo";
  return rawMode === "raw" && !heifPlusEnabled ? "RAW" : null;
};

const getAppleStylesCompatibility = ({
  preferenceEnabled = false,
  styles3PreferenceEnabled = false,
  ...captureModes
} = {}) => {
  const suspensionReason = getAppleStylesSuspensionReason(captureModes);

  return {
    preferenceEnabled: Boolean(preferenceEnabled),
    effective: Boolean(preferenceEnabled) && suspensionReason === null,
    styles3Effective:
      Boolean(preferenceEnabled) &&
      Boolean(styles3PreferenceEnabled) &&
      suspensionReason === null,
    suspensionReason: preferenceEnabled ? suspensionReason : null,
  };
};

module.exports = {
  getAppleStylesCompatibility,
  getAppleStylesSuspensionReason,
};
