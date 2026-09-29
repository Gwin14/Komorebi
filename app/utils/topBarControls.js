import { Platform } from "react-native";

export const TOP_BAR_CONTROLS = [
  //   {
  //     id: "aspectRatio",
  //     label: "Zoom",
  //     icon: "crop-outline",
  //     alwaysEnabled: false,
  //   },
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
    label: "Detecção de Sorriso",
    icon: "happy-outline",
    alwaysEnabled: false,
  },
  {
    id: "vertical",
    label: "Proporção",
    icon: "phone-portrait-outline",
    alwaysEnabled: false,
  },
  {
    id: "doubleCapture",
    label: "Captura Dupla",
    icon: "layers-outline",
    alwaysEnabled: false,
  },
  {
    id: "flash",
    label: "Flash",
    icon: "flash-outline",
    alwaysEnabled: false,
  },
  {
    id: "manual",
    label: "Controles manuais",
    icon: "options-outline",
    alwaysEnabled: false,
  },
  {
    id: "stacking",
    label: "Image Stacking",
    icon: "layers-outline",
    alwaysEnabled: false,
  },
  {
    id: "rawCapture",
    label: "RAW / ProRAW",
    icon: "aperture-outline",
    alwaysEnabled: false,
  },
  {
    id: "livePhoto",
    label: "Live Photo",
    icon: "radio-button-on-outline",
    alwaysEnabled: false,
  },
  {
    id: "portrait",
    label: "Retrato",
    icon: "person-outline",
    alwaysEnabled: false,
  },
  {
    id: "projects",
    label: "Projetos",
    icon: "folder-outline",
    alwaysEnabled: false,
  },
];

export function getDefaultTopBarControls(platform = Platform.OS) {
  return [
    "luts",
    ...(platform === "ios" ? ["livePhoto"] : []),
    "vertical",
    "manual",
    ...(platform === "ios" ? ["stacking"] : []),
    "settings",
  ];
}

export const DEFAULT_TOP_BAR_CONTROLS = getDefaultTopBarControls();

export const TOP_BAR_MAX_CONTROLS = 8;

export function normalizeTopBarControls(savedControls) {
  if (!Array.isArray(savedControls)) {
    return [...DEFAULT_TOP_BAR_CONTROLS];
  }

  const validIds = TOP_BAR_CONTROLS.map((control) => control.id);
  const parsed = [
    ...new Set(savedControls.filter((id) => validIds.includes(id))),
  ];

  if (!parsed.includes("settings")) {
    parsed.push("settings");
  }

  if (parsed.length <= TOP_BAR_MAX_CONTROLS) return parsed;

  const settingsIndex = parsed.indexOf("settings");
  if (settingsIndex < TOP_BAR_MAX_CONTROLS) {
    return parsed.slice(0, TOP_BAR_MAX_CONTROLS);
  }

  return [...parsed.slice(0, TOP_BAR_MAX_CONTROLS - 1), "settings"];
}
