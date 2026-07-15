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
      threshold: 0.82,
      softness: 0.12,
      radius: 7,
      intensity: 0.12,
      red: 1,
      green: 0.28,
      blue: 0.04,
    },
  },
  {
    id: "medium",
    name: "Médio",
    config: {
      threshold: 0.76,
      softness: 0.15,
      radius: 11,
      intensity: 0.18,
      red: 1,
      green: 0.24,
      blue: 0.035,
    },
  },
  {
    id: "film",
    name: "Filme",
    config: {
      threshold: 0.7,
      softness: 0.18,
      radius: 15,
      intensity: 0.24,
      red: 1,
      green: 0.2,
      blue: 0.03,
    },
  },
];

export const getHalationConfig = (halationId) =>
  AVAILABLE_HALATIONS.find((halation) => halation.id === halationId)?.config ||
  null;
