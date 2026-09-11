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
  {
    id: "amber",
    name: "Âmbar",
    config: {
      threshold: 0.66,
      softness: 0.22,
      radius: 20,
      intensity: 0.32,
      red: 1,
      green: 0.34,
      blue: 0.06,
    },
  },
  {
    id: "neon",
    name: "Neon",
    config: {
      threshold: 0.6,
      softness: 0.26,
      radius: 28,
      intensity: 0.42,
      red: 1,
      green: 0.1,
      blue: 0.015,
    },
  },
  {
    id: "aura",
    name: "Aura",
    config: {
      threshold: 0.54,
      softness: 0.32,
      radius: 36,
      intensity: 0.5,
      red: 1,
      green: 0.24,
      blue: 0.08,
    },
  },
];

export const getHalationConfig = (halationId) =>
  AVAILABLE_HALATIONS.find((halation) => halation.id === halationId)?.config ||
  null;
