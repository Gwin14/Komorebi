import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

const SettingsContext = createContext(null);

const STORAGE_KEYS = {
  SAVE_ORIGINAL: "@settings/saveOriginal",
  GRID_VISIBLE: "@settings/gridVisible",
};

export const SettingsProvider = ({ children }) => {
  const [saveOriginal, setSaveOriginal] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedOriginal = await AsyncStorage.getItem(
          STORAGE_KEYS.SAVE_ORIGINAL
        );
        const savedGrid = await AsyncStorage.getItem(STORAGE_KEYS.GRID_VISIBLE);

        if (savedOriginal !== null) setSaveOriginal(savedOriginal === "true");

        if (savedGrid !== null) setGridVisible(savedGrid === "true");
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
      AsyncStorage.setItem(STORAGE_KEYS.SAVE_ORIGINAL, saveOriginal.toString());
    }
  }, [saveOriginal, loading]);

  // 💾 Salvar "Grade da Câmera"
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(STORAGE_KEYS.GRID_VISIBLE, gridVisible.toString());
    }
  }, [gridVisible, loading]);

  const value = {
    saveOriginal,
    setSaveOriginal,
    gridVisible,
    setGridVisible,
    loading,
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
