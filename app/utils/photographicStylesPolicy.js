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
  ...captureModes
} = {}) => {
  const suspensionReason = getAppleStylesSuspensionReason(captureModes);

  return {
    preferenceEnabled: Boolean(preferenceEnabled),
    effective:
      Boolean(preferenceEnabled) && suspensionReason === null,
    suspensionReason: preferenceEnabled ? suspensionReason : null,
  };
};

module.exports = {
  getAppleStylesCompatibility,
  getAppleStylesSuspensionReason,
};
