export const AVAILABLE_LUTS = [
  {
    id: "none",
    name: "Sem Filtro",
    file: null,
  },

  {
    id: "filtro1",
    name: "Guaraná",
    file: require("../../assets/luts/guarana.cube"),
  },

  {
    id: "filtro2",
    name: "Maracujá",
    file: require("../../assets/luts/maracuja.cube"),
  },

  {
    id: "filtro3",
    name: "Mirtilo",
    file: require("../../assets/luts/mirtilo.cube"),
  },

  {
    id: "filtro4",
    name: "Pitaia",
    file: require("../../assets/luts/pitaia.cube"),
  },

  {
    id: "filtro5",
    name: "Damasco",
    file: require("../../assets/luts/damasco.cube"),
  },

  {
    id: "filtro6",
    name: "Cinema",
    file: require("../../assets/luts/cinema.cube"),
  },
];

export const LUT_GRAIN_CONFIG = {
  none: null,
  // filtro1: {
  //   lumaStd: 14,
  //   rStd: 5,
  //   gStd: 3,
  //   bStd: 8,
  //   shadowBoost: 1.4,
  //   highlightReduction: 0.5,
  //   clumpFreq: 0.07,
  //   clumpAmp: 0.4,
  //   octaves: 3,
  // }, // Dark Gold — Tri-X feel
  // filtro2: null, // Wes Anderson — sem grain
  // filtro3: {
  //   lumaStd: 20,
  //   rStd: 9,
  //   gStd: 5,
  //   bStd: 13,
  //   shadowBoost: 1.7,
  //   highlightReduction: 0.4,
  //   clumpFreq: 0.065,
  //   clumpAmp: 0.55,
  //   octaves: 3,
  // }, // Cinema — CineStill feel
  filtro1: null,
  filtro2: null,
  filtro3: null,
  filtro4: null,
  filtro5: null,
  filtro6: {
    lumaStd: 14,
    rStd: 5,
    gStd: 3,
    bStd: 8,
    shadowBoost: 1.4,
    highlightReduction: 0.5,
    clumpFreq: 0.07,
    clumpAmp: 0.4,
    octaves: 3,
  }, // Cinema — Tri-X feel
};
