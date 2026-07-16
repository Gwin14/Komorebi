import { createContext, useContext, useEffect, useState } from "react";
import {
  loadStoredSettings,
  saveStoredSetting,
  SETTINGS_STORAGE_KEYS,
} from "../utils/settingsStorage";
import { DEFAULT_TOP_BAR_CONTROLS } from "../utils/topBarControls";

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  retroStyle: false,
  gridVisible: false,
  shutterSound: false,
  location: true,
  saveOriginalWithoutEffects: false,
  firstTime: true,
  customLuts: [],
  topBarBelow: false,
  topBarControls: DEFAULT_TOP_BAR_CONTROLS,
};

export const SettingsProvider = ({ children }) => {
  const [retroStyle, setRetroStyle] = useState(DEFAULT_SETTINGS.retroStyle);
  const [gridVisible, setGridVisible] = useState(DEFAULT_SETTINGS.gridVisible);
  const [loading, setLoading] = useState(true);
  const [shutterSound, setShutterSound] = useState(
    DEFAULT_SETTINGS.shutterSound,
  );
  const [location, setLocation] = useState(DEFAULT_SETTINGS.location);
  const [saveOriginalWithoutEffects, setSaveOriginalWithoutEffects] = useState(
    DEFAULT_SETTINGS.saveOriginalWithoutEffects,
  );
  const [firstTime, setFirstTime] = useState(DEFAULT_SETTINGS.firstTime);
  const [customLuts, setCustomLuts] = useState(DEFAULT_SETTINGS.customLuts);
  const [topBarBelow, setTopBarBelow] = useState(DEFAULT_SETTINGS.topBarBelow);
  const [topBarControls, setTopBarControls] = useState(
    DEFAULT_SETTINGS.topBarControls,
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await loadStoredSettings(DEFAULT_SETTINGS);

        setRetroStyle(savedSettings.retroStyle);
        setGridVisible(savedSettings.gridVisible);
        setShutterSound(savedSettings.shutterSound);
        setLocation(savedSettings.location);
        setSaveOriginalWithoutEffects(savedSettings.saveOriginalWithoutEffects);
        setFirstTime(True);
        setCustomLuts(savedSettings.customLuts);
        setTopBarBelow(savedSettings.topBarBelow);
        setTopBarControls(savedSettings.topBarControls);
      } catch (e) {
        console.error("Erro ao carregar settings", e);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // 💾 Salvar "Salvar Original"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.RETRO_STYLE,
        retroStyle.toString(),
      );
    }
  }, [retroStyle, loading]);

  // 💾 Salvar "Grade da Câmera"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.GRID_VISIBLE,
        gridVisible.toString(),
      );
    }
  }, [gridVisible, loading]);

  // 💾 Salvar "Som de shutter"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.SHUTTER_SOUND,
        shutterSound.toString(),
      );
    }
  }, [shutterSound, loading]);

  // Preserva a chave legada para manter a preferência dos usuários atuais.
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.SAVE_ORIGINAL_WITH_LUT,
        saveOriginalWithoutEffects.toString(),
      );
    }
  }, [saveOriginalWithoutEffects, loading]);

  // 💾 Salvar "Custom LUTs"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.CUSTOM_LUTS,
        JSON.stringify(customLuts),
      );
    }
  }, [customLuts, loading]);

  // 💾 Salvar "Localização"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(SETTINGS_STORAGE_KEYS.LOCATION, location.toString());
    }
  }, [location, loading]);

  // 💾 Salvar "Primeira vez"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(SETTINGS_STORAGE_KEYS.FIRSTTIME, firstTime.toString());
    }
  }, [firstTime, loading]);

  // 💾 Salvar "TopBar Below"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.TOP_BAR_BELOW,
        topBarBelow.toString(),
      );
    }
  }, [topBarBelow, loading]);

  // 💾 Salvar "TopBar Controls"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.TOP_BAR_CONTROLS,
        JSON.stringify(topBarControls),
      );
    }
  }, [topBarControls, loading]);

  const value = {
    retroStyle,
    setRetroStyle,
    gridVisible,
    setGridVisible,
    loading,
    shutterSound,
    setShutterSound,
    location,
    setLocation,
    saveOriginalWithoutEffects,
    setSaveOriginalWithoutEffects,
    firstTime,
    setFirstTime,
    customLuts,
    setCustomLuts,
    topBarControls,
    setTopBarControls,
    topBarBelow,
    setTopBarBelow,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings deve ser usado dentro do SettingsProvider");
  }
  return context;
};
