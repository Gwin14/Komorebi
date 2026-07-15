export const AVAILABLE_GRAINS = [
  {
    id: "none",
    name: "Sem Grão",
    config: null,
  },
  {
    id: "fine",
    name: "Fino",
    config: {
      lumaStd: 4,
      rStd: 1,
      gStd: 0.6,
      bStd: 1.4,
      shadowBoost: 0.45,
      highlightReduction: 0.55,
      clumpFreq: 0.1,
      clumpAmp: 0.08,
      octaves: 2,
    },
  },
  {
    id: "soft",
    name: "Suave",
    config: {
      lumaStd: 6.5,
      rStd: 1.6,
      gStd: 1,
      bStd: 2.2,
      shadowBoost: 0.7,
      highlightReduction: 0.5,
      clumpFreq: 0.085,
      clumpAmp: 0.16,
      octaves: 2,
    },
  },
  {
    id: "film",
    name: "Filme",
    config: {
      lumaStd: 9,
      rStd: 2.8,
      gStd: 1.7,
      bStd: 4,
      shadowBoost: 0.95,
      highlightReduction: 0.48,
      clumpFreq: 0.07,
      clumpAmp: 0.28,
      octaves: 3,
    },
  },
];

export const getGrainConfig = (grainId) =>
  AVAILABLE_GRAINS.find((grain) => grain.id === grainId)?.config || null;
