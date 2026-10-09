import { normalizeControlGestures } from "./controlGestures";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { restoreIntelligentPreferences } from "./intelligentSettings";
import { restoreZebraPreferences } from "./zebraSettings";
import { normalizeTopBarControls } from "./topBarControls";

import {
  normalizeHeifPlusSettings,
  restorePhotoFormat,
} from "./heifPlusSettings";

export const SETTINGS_STORAGE_KEYS = {
  CONTROL_GESTURES: "@settings/controlGestures",
  PHOTO_AUTHOR: "@settings/photoAuthor",
  PHOTO_COPYRIGHT: "@settings/photoCopyright",
  RETRO_STYLE: "@settings/retroStyle",
  GRID_VISIBLE: "@settings/gridVisible",
  LEVEL_VISIBLE: "@settings/levelVisible",
  HISTOGRAM_VISIBLE: "@settings/histogramVisible",
  PREVIEW_LUT: "@settings/previewLut",
  PREVIEW_HALATION: "@settings/previewHalation",
  PREVIEW_GRAIN: "@settings/previewGrain",
  PREVIEW_DOUBLE_EXPOSURE: "@settings/previewDoubleExposure",
  PREVIEW_STACKING: "@settings/previewStacking",
  ZEBRA_HIGHLIGHTS_ENABLED: "@settings/zebraHighlightsEnabled",
  ZEBRA_SHADOWS_ENABLED: "@settings/zebraShadowsEnabled",
  COMPOSITION_SCAN_ENABLED: "@settings/compositionScanEnabled",
  INTELLIGENT_TAGS_ENABLED: "@settings/intelligentTagsEnabled",
  INTELLIGENT_FILENAME_ENABLED: "@settings/intelligentFilenameEnabled",
  SHUTTER_SOUND: "@settings/shutterSound",
  LOCATION: "@settings/location",
  PHOTO_FORMAT: "@settings/photoFormat",
  HEIF_PLUS_SETTINGS: "@settings/heifPlusSettings",
  SAVE_AS_JPEG: "@settings/saveAsJpeg",
  PRESERVE_APPLE_PHOTOGRAPHIC_STYLES:
    "@settings/preserveApplePhotographicStyles",
  PHOTOGRAPHIC_STYLES_3_ENABLED: "@settings/photographicStyles3Enabled",
  SAVE_ORIGINAL_WITH_LUT: "@settings/saveOriginalWithLUT",
  DIAGNOSTICS_ENABLED: "@settings/diagnosticsEnabled",
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
  const stored = Object.fromEntries(
    await AsyncStorage.multiGet(Object.values(keys)),
  );
  const savedRetroStyle = stored[keys.RETRO_STYLE] ?? null;
  const savedGridVisible = stored[keys.GRID_VISIBLE] ?? null;
  const savedLevelVisible = stored[keys.LEVEL_VISIBLE] ?? null;
  const savedHistogramVisible = stored[keys.HISTOGRAM_VISIBLE] ?? null;
  const savedPreviewLut = stored[keys.PREVIEW_LUT] ?? null;
  const savedPreviewHalation = stored[keys.PREVIEW_HALATION] ?? null;
  const savedPreviewGrain = stored[keys.PREVIEW_GRAIN] ?? null;
  const savedPreviewDoubleExposure =
    stored[keys.PREVIEW_DOUBLE_EXPOSURE] ?? null;
  const savedPreviewStacking = stored[keys.PREVIEW_STACKING] ?? null;
  const savedZebraHighlightsEnabled =
    stored[keys.ZEBRA_HIGHLIGHTS_ENABLED] ?? null;
  const savedZebraShadowsEnabled = stored[keys.ZEBRA_SHADOWS_ENABLED] ?? null;
  const savedCompositionScanEnabled =
    stored[keys.COMPOSITION_SCAN_ENABLED] ?? null;
  const savedIntelligentTagsEnabled =
    stored[keys.INTELLIGENT_TAGS_ENABLED] ?? null;
  const savedIntelligentFilenameEnabled =
    stored[keys.INTELLIGENT_FILENAME_ENABLED] ?? null;
  const savedShutterSound = stored[keys.SHUTTER_SOUND] ?? null;
  const savedLocation = stored[keys.LOCATION] ?? null;
  const savedSaveAsJpeg = stored[keys.SAVE_AS_JPEG] ?? null;
  const savedPreserveApplePhotographicStyles =
    stored[keys.PRESERVE_APPLE_PHOTOGRAPHIC_STYLES] ?? null;
  const savedSaveOriginalWithLUT = stored[keys.SAVE_ORIGINAL_WITH_LUT] ?? null;
  const savedFirstTime = stored[keys.FIRSTTIME] ?? null;
  const savedCustomLuts = stored[keys.CUSTOM_LUTS] ?? null;
  const savedTopBarBelow = stored[keys.TOP_BAR_BELOW] ?? null;
  const savedTopBarControls = stored[keys.TOP_BAR_CONTROLS] ?? null;
  const savedProjects = stored[keys.PROJECTS] ?? null;
  const savedActiveProjectId = stored[keys.ACTIVE_PROJECT_ID] ?? null;
  const photoAuthor = stored[keys.PHOTO_AUTHOR] ?? null;
  const photoCopyright = stored[keys.PHOTO_COPYRIGHT] ?? null;
  const format = stored[keys.PHOTO_FORMAT] ?? null;
  const rawSettings = stored[keys.HEIF_PLUS_SETTINGS] ?? null;

  const intelligentPreferences = restoreIntelligentPreferences(
    {
      compositionScan: savedCompositionScanEnabled,
      tags: savedIntelligentTagsEnabled,
      filename: savedIntelligentFilenameEnabled,
    },
    defaults,
  );
  const zebraPreferences = restoreZebraPreferences(
    {
      highlights: savedZebraHighlightsEnabled,
      shadows: savedZebraShadowsEnabled,
    },
    defaults,
  );

  return {
    controlGestures: normalizeControlGestures(parseJSON(stored[keys.CONTROL_GESTURES] ?? null, null)),
    photoFormat: restorePhotoFormat(
      format,
      parseBoolean(savedSaveAsJpeg, defaults.saveAsJpeg),
    ),
    heifPlusSettings: normalizeHeifPlusSettings(parseJSON(rawSettings, null)),
    photoAuthor: photoAuthor ?? defaults.photoAuthor,
    photoCopyright: photoCopyright ?? defaults.photoCopyright,
    retroStyle: parseBoolean(savedRetroStyle, defaults.retroStyle),
    gridVisible: parseBoolean(savedGridVisible, defaults.gridVisible),
    levelVisible: parseBoolean(savedLevelVisible, defaults.levelVisible),
    histogramVisible: parseBoolean(
      savedHistogramVisible,
      defaults.histogramVisible,
    ),
    previewLut: parseBoolean(savedPreviewLut, defaults.previewLut),
    previewHalation: parseBoolean(
      savedPreviewHalation,
      defaults.previewHalation,
    ),
    previewGrain: parseBoolean(savedPreviewGrain, defaults.previewGrain),
    previewDoubleExposure: parseBoolean(
      savedPreviewDoubleExposure,
      defaults.previewDoubleExposure,
    ),
    previewStacking: parseBoolean(
      savedPreviewStacking,
      defaults.previewStacking,
    ),
    ...zebraPreferences,
    ...intelligentPreferences,
    shutterSound: parseBoolean(savedShutterSound, defaults.shutterSound),
    location: parseBoolean(savedLocation, defaults.location),
    saveAsJpeg: parseBoolean(savedSaveAsJpeg, defaults.saveAsJpeg),
    preserveApplePhotographicStyles: parseBoolean(
      savedPreserveApplePhotographicStyles,
      defaults.preserveApplePhotographicStyles,
    ),
    photographicStyles3Enabled: parseBoolean(
      stored[keys.PHOTOGRAPHIC_STYLES_3_ENABLED] ?? null,
      defaults.photographicStyles3Enabled,
    ),
    saveOriginalWithoutEffects: parseBoolean(
      savedSaveOriginalWithLUT,
      defaults.saveOriginalWithoutEffects,
    ),
    diagnosticsEnabled: parseBoolean(stored[keys.DIAGNOSTICS_ENABLED] ?? null, defaults.diagnosticsEnabled),
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
