import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeTopBarControls } from "./topBarControls";

export const SETTINGS_STORAGE_KEYS = {
  RETRO_STYLE: "@settings/retroStyle",
  GRID_VISIBLE: "@settings/gridVisible",
  LEVEL_VISIBLE: "@settings/levelVisible",
  HISTOGRAM_VISIBLE: "@settings/histogramVisible",
  COMPOSITION_SCAN_ENABLED: "@settings/compositionScanEnabled",
  SHUTTER_SOUND: "@settings/shutterSound",
  LOCATION: "@settings/location",
  SAVE_AS_JPEG: "@settings/saveAsJpeg",
  PRESERVE_APPLE_PHOTOGRAPHIC_STYLES:
    "@settings/preserveApplePhotographicStyles",
  SAVE_ORIGINAL_WITH_LUT: "@settings/saveOriginalWithLUT",
  FIRSTTIME: "@settings/firstTime",
  CUSTOM_LUTS: "@settings/customLuts",
  TOP_BAR_BELOW: "@settings/topBarBelow",
  TOP_BAR_CONTROLS: "@settings/topBarControls",
  PROJECTS: "@settings/projects",
  ACTIVE_PROJECT_ID: "@settings/activeProjectId",
};

const parseBoolean = (value, fallback) => {
  if (value === null) return fallback;
  return value === "true";
};

const parseJSON = (value, fallback) => {
  if (value === null) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("Erro ao ler configuração salva", error);
    return fallback;
  }
};

export async function loadStoredSettings(defaults) {
  const keys = SETTINGS_STORAGE_KEYS;
  const [
    savedRetroStyle,
    savedGridVisible,
    savedLevelVisible,
    savedHistogramVisible,
    savedCompositionScanEnabled,
    savedShutterSound,
    savedLocation,
    savedSaveAsJpeg,
    savedPreserveApplePhotographicStyles,
    savedSaveOriginalWithLUT,
    savedFirstTime,
    savedCustomLuts,
    savedTopBarBelow,
    savedTopBarControls,
    savedProjects,
    savedActiveProjectId,
    ] = await Promise.all([
    AsyncStorage.getItem(keys.RETRO_STYLE),
    AsyncStorage.getItem(keys.GRID_VISIBLE),
    AsyncStorage.getItem(keys.LEVEL_VISIBLE),
    AsyncStorage.getItem(keys.HISTOGRAM_VISIBLE),
    AsyncStorage.getItem(keys.COMPOSITION_SCAN_ENABLED),
    AsyncStorage.getItem(keys.SHUTTER_SOUND),
    AsyncStorage.getItem(keys.LOCATION),
    AsyncStorage.getItem(keys.SAVE_AS_JPEG),
    AsyncStorage.getItem(keys.PRESERVE_APPLE_PHOTOGRAPHIC_STYLES),
    AsyncStorage.getItem(keys.SAVE_ORIGINAL_WITH_LUT),
    AsyncStorage.getItem(keys.FIRSTTIME),
    AsyncStorage.getItem(keys.CUSTOM_LUTS),
    AsyncStorage.getItem(keys.TOP_BAR_BELOW),
    AsyncStorage.getItem(keys.TOP_BAR_CONTROLS),
    AsyncStorage.getItem(keys.PROJECTS),
    AsyncStorage.getItem(keys.ACTIVE_PROJECT_ID),
    ]);

    return {
    retroStyle: parseBoolean(savedRetroStyle, defaults.retroStyle),
    gridVisible: parseBoolean(savedGridVisible, defaults.gridVisible),
    levelVisible: parseBoolean(savedLevelVisible, defaults.levelVisible),
    histogramVisible: parseBoolean(
      savedHistogramVisible,
      defaults.histogramVisible,
    ),
    compositionScanEnabled: parseBoolean(
      savedCompositionScanEnabled,
      defaults.compositionScanEnabled,
    ),
    shutterSound: parseBoolean(savedShutterSound, defaults.shutterSound),
    location: parseBoolean(savedLocation, defaults.location),
    saveAsJpeg: parseBoolean(savedSaveAsJpeg, defaults.saveAsJpeg),
    preserveApplePhotographicStyles: parseBoolean(
      savedPreserveApplePhotographicStyles,
      defaults.preserveApplePhotographicStyles,
    ),
    saveOriginalWithoutEffects: parseBoolean(
      savedSaveOriginalWithLUT,
      defaults.saveOriginalWithoutEffects,
    ),
    firstTime: parseBoolean(savedFirstTime, defaults.firstTime),
    customLuts: parseJSON(savedCustomLuts, defaults.customLuts),
    topBarBelow: parseBoolean(savedTopBarBelow, defaults.topBarBelow),
    topBarControls: normalizeTopBarControls(
      parseJSON(savedTopBarControls, defaults.topBarControls),
    ),
    projects: parseJSON(savedProjects, defaults.projects),
    activeProjectId: savedActiveProjectId || defaults.activeProjectId,
    };
}

export function saveStoredSetting(key, value) {
  if (value == null) return AsyncStorage.removeItem(key);
  return AsyncStorage.setItem(key, value);
}
