export const AVAILABLE_GRAINS = [
  {
    id: "none",
    name: "Sem Grão",
    config: null,
  },
  {
    id: "soft",
    name: "Suave",
    config: {
      lumaStrength: 4.5,
      chromaStrength: 0.45,
      shadowBoost: 0.12,
      highlightReduction: 0.68,
      correlation: 0.05,
      clumpSize: 26,
      clumpAmount: 0.07,
    },
  },
  {
    id: "medium",
    name: "Médio",
    config: {
      lumaStrength: 8,
      chromaStrength: 0.8,
      shadowBoost: 0.22,
      highlightReduction: 0.58,
      correlation: 0.16,
      clumpSize: 34,
      clumpAmount: 0.13,
    },
  },
  {
    id: "strong",
    name: "Forte",
    config: {
      lumaStrength: 12.5,
      chromaStrength: 1.35,
      shadowBoost: 0.32,
      highlightReduction: 0.48,
      correlation: 0.28,
      clumpSize: 44,
      clumpAmount: 0.22,
    },
  },
];

export const getGrainConfig = (grainId) =>
  AVAILABLE_GRAINS.find((grain) => grain.id === grainId)?.config || null;
