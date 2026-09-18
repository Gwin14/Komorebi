export const AVAILABLE_HALATIONS = [
  {
    id: "none",
    name: "Sem Halation",
    config: null,
  },
  {
    id: "soft",
    name: "Suave",
    config: {
      threshold: 0.8,
      softness: 0.14,
      contrastRadius: 56,
      minContrast: 0.18,
      contrastSoftness: 0.2,
      fringeRadius: 10,
      fringeIntensity: 1,
      diffusionRadius: 26,
      diffusionIntensity: 0.32,
      targetPeakOpacity: 0.22,
    },
  },
  {
    id: "medium",
    name: "Médio",
    config: {
      threshold: 0.76,
      softness: 0.18,
      contrastRadius: 68,
      minContrast: 0.14,
      contrastSoftness: 0.22,
      fringeRadius: 14,
      fringeIntensity: 1.35,
      diffusionRadius: 36,
      diffusionIntensity: 0.44,
      targetPeakOpacity: 0.36,
    },
  },
  {
    id: "strong",
    name: "Forte",
    config: {
      threshold: 0.72,
      softness: 0.22,
      contrastRadius: 82,
      minContrast: 0.1,
      contrastSoftness: 0.24,
      fringeRadius: 20,
      fringeIntensity: 1.7,
      diffusionRadius: 48,
      diffusionIntensity: 0.58,
      targetPeakOpacity: 0.52,
    },
  },
];

export const getHalationConfig = (halationId) =>
  AVAILABLE_HALATIONS.find((halation) => halation.id === halationId)?.config ||
  null;
