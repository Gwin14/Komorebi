import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

const SettingsContext = createContext(null);

const STORAGE_KEYS = {
  RETRO_STYLE: "@settings/retroStyle",
  GRID_VISIBLE: "@settings/gridVisible",
  SHUTTER_SOUND: "@settings/shutterSound",
  LOCATION: "@settings/location",
  SAVE_ORIGINAL_WITH_LUT: "@settings/saveOriginalWithLUT",
  FIRSTTIME: "@settings/firstTime",
};

export const SettingsProvider = ({ children }) => {
  const [retroStyle, setRetroStyle] = useState(false);
  const [gridVisible, setGridVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shutterSound, setShutterSound] = useState(false);
  const [location, setLocation] = useState(true);
  const [saveOriginalWithLUT, setSaveOriginalWithLUT] = useState(false);
  const [firstTime, setFirstTime] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedRetroStyle = await AsyncStorage.getItem(
          STORAGE_KEYS.RETRO_STYLE,
        );

        const savedGrid = await AsyncStorage.getItem(STORAGE_KEYS.GRID_VISIBLE);

        const savedShutterSound = await AsyncStorage.getItem(
          STORAGE_KEYS.SHUTTER_SOUND,
        );

        const savedFirstTime = await AsyncStorage.getItem(
          STORAGE_KEYS.FIRSTTIME,
        );

        const savedSaveOriginalWithLUT = await AsyncStorage.getItem(
          STORAGE_KEYS.SAVE_ORIGINAL_WITH_LUT,
        );

        const savedLocation = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION);

        // ----------

        if (savedLocation !== null) setLocation(savedLocation === "true");

        if (savedRetroStyle !== null) setRetroStyle(savedRetroStyle === "true");

        if (savedGrid !== null) setGridVisible(savedGrid === "true");

        if (savedShutterSound !== null)
          setShutterSound(savedShutterSound === "true");

        if (savedSaveOriginalWithLUT !== null)
          setSaveOriginalWithLUT(savedSaveOriginalWithLUT === "true");

        if (savedFirstTime !== null) setFirstTime(savedFirstTime === "true");
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
      AsyncStorage.setItem(STORAGE_KEYS.RETRO_STYLE, retroStyle.toString());
    }
  }, [retroStyle, loading]);

  // 💾 Salvar "Grade da Câmera"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEYS.GRID_VISIBLE, gridVisible.toString());
    }
  }, [gridVisible, loading]);

  // 💾 Salvar "Som de shutter"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEYS.SHUTTER_SOUND, shutterSound.toString());
    }
  }, [shutterSound, loading]);

  // 💾 Salvar "Salvar original sem LUT"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(
        STORAGE_KEYS.SAVE_ORIGINAL_WITH_LUT,
        saveOriginalWithLUT.toString(),
      );
    }
  }, [saveOriginalWithLUT, loading]);

  // 💾 Salvar "Localização"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEYS.LOCATION, location.toString());
    }
  }, [location, loading]);

  // 💾 Salvar "Primeira vez"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEYS.FIRSTTIME, firstTime.toString());
    }
  }, [firstTime, loading]);

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
    saveOriginalWithLUT,
    setSaveOriginalWithLUT,
    firstTime,
    setFirstTime,
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
