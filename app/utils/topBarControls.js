export const TOP_BAR_CONTROLS = [
  {
    id: "aspectRatio",
    label: "Aspect Ratio",
    icon: "crop-outline",
    alwaysEnabled: false,
  },
  {
    id: "weather",
    label: "Tempo",
    icon: "cloud-outline",
    alwaysEnabled: false,
  },
  {
    id: "luts",
    label: "LUTs",
    icon: "color-filter-outline",
    alwaysEnabled: false,
  },
  {
    id: "settings",
    label: "Configurações",
    icon: "settings-outline",
    alwaysEnabled: true,
  },
  {
    id: "smile",
    label: "Smile",
    icon: "happy-outline",
    alwaysEnabled: false,
  },
  {
    id: "vertical",
    label: "Vertical",
    icon: "phone-portrait-outline",
    alwaysEnabled: false,
  },
  {
    id: "doubleCapture",
    label: "Duplo",
    icon: "layers-outline",
    alwaysEnabled: false,
  },
  {
    id: "flash",
    label: "Flash",
    icon: "flash-outline",
    alwaysEnabled: false,
  },
];

export const DEFAULT_TOP_BAR_CONTROLS = [
  "aspectRatio",
  "weather",
  "luts",
  "settings",
];

export const TOP_BAR_MAX_CONTROLS = 6;

export function normalizeTopBarControls(savedControls) {
  if (!Array.isArray(savedControls)) {
    return DEFAULT_TOP_BAR_CONTROLS;
  }

  const validIds = TOP_BAR_CONTROLS.map((control) => control.id);
  const parsed = [
    ...new Set(savedControls.filter((id) => validIds.includes(id))),
  ];

  if (!parsed.includes("settings")) {
    parsed.push("settings");
  }

  return parsed.slice(0, TOP_BAR_MAX_CONTROLS);
}
