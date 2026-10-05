const getAppleStylesSuspensionReason = ({
  livePhotoEnabled = false,
  portraitModeEnabled = false,
  rawMode = "off",
} = {}) => {
  if (livePhotoEnabled) return "Live Photo";
  if (portraitModeEnabled) return "Retrato";
  if (rawMode !== "off") return "RAW";
  return null;
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
