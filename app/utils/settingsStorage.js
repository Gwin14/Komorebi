import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeTopBarControls } from "./topBarControls";

export const SETTINGS_STORAGE_KEYS = {
  RETRO_STYLE: "@settings/retroStyle",
  GRID_VISIBLE: "@settings/gridVisible",
  LEVEL_VISIBLE: "@settings/levelVisible",
  SHUTTER_SOUND: "@settings/shutterSound",
  LOCATION: "@settings/location",
  SAVE_ORIGINAL_WITH_LUT: "@settings/saveOriginalWithLUT",
  FIRSTTIME: "@settings/firstTime",
  CUSTOM_LUTS: "@settings/customLuts",
  TOP_BAR_BELOW: "@settings/topBarBelow",
  TOP_BAR_CONTROLS: "@settings/topBarControls",
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
    savedShutterSound,
    savedLocation,
    savedSaveOriginalWithLUT,
    savedFirstTime,
    savedCustomLuts,
    savedTopBarBelow,
    savedTopBarControls,
  ] = await Promise.all([
    AsyncStorage.getItem(keys.RETRO_STYLE),
    AsyncStorage.getItem(keys.GRID_VISIBLE),
    AsyncStorage.getItem(keys.LEVEL_VISIBLE),
    AsyncStorage.getItem(keys.SHUTTER_SOUND),
    AsyncStorage.getItem(keys.LOCATION),
    AsyncStorage.getItem(keys.SAVE_ORIGINAL_WITH_LUT),
    AsyncStorage.getItem(keys.FIRSTTIME),
    AsyncStorage.getItem(keys.CUSTOM_LUTS),
    AsyncStorage.getItem(keys.TOP_BAR_BELOW),
    AsyncStorage.getItem(keys.TOP_BAR_CONTROLS),
  ]);

  return {
    retroStyle: parseBoolean(savedRetroStyle, defaults.retroStyle),
    gridVisible: parseBoolean(savedGridVisible, defaults.gridVisible),
    levelVisible: parseBoolean(savedLevelVisible, defaults.levelVisible),
    shutterSound: parseBoolean(savedShutterSound, defaults.shutterSound),
    location: parseBoolean(savedLocation, defaults.location),
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
  };
}

export function saveStoredSetting(key, value) {
  return AsyncStorage.setItem(key, value);
}
