import { createContext, useContext, useEffect, useState } from "react";
import {
  loadStoredSettings,
  saveStoredSetting,
  SETTINGS_STORAGE_KEYS,
} from "../utils/settingsStorage";
import { DEFAULT_TOP_BAR_CONTROLS } from "../utils/topBarControls";
import { reconcileProjectsWithAlbums } from "../utils/projects";

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  retroStyle: false,
  gridVisible: false,
  levelVisible: false,
  histogramVisible: false,
  compositionScanEnabled: true,
  shutterSound: false,
  location: true,
  saveAsJpeg: false,
  saveOriginalWithoutEffects: false,
  firstTime: true,
  customLuts: [],
  topBarBelow: false,
  topBarControls: DEFAULT_TOP_BAR_CONTROLS,
  projects: [],
  activeProjectId: null,
};

export const SettingsProvider = ({ children }) => {
  const [retroStyle, setRetroStyle] = useState(DEFAULT_SETTINGS.retroStyle);
  const [gridVisible, setGridVisible] = useState(DEFAULT_SETTINGS.gridVisible);
  const [levelVisible, setLevelVisible] = useState(
    DEFAULT_SETTINGS.levelVisible,
  );
  const [histogramVisible, setHistogramVisible] = useState(
    DEFAULT_SETTINGS.histogramVisible,
  );
  const [compositionScanEnabled, setCompositionScanEnabled] = useState(
    DEFAULT_SETTINGS.compositionScanEnabled,
  );
  const [loading, setLoading] = useState(true);
  const [shutterSound, setShutterSound] = useState(
    DEFAULT_SETTINGS.shutterSound,
  );
  const [location, setLocation] = useState(DEFAULT_SETTINGS.location);
  const [saveAsJpeg, setSaveAsJpeg] = useState(DEFAULT_SETTINGS.saveAsJpeg);
  const [saveOriginalWithoutEffects, setSaveOriginalWithoutEffects] = useState(
    DEFAULT_SETTINGS.saveOriginalWithoutEffects,
  );
  const [firstTime, setFirstTime] = useState(DEFAULT_SETTINGS.firstTime);
  const [customLuts, setCustomLuts] = useState(DEFAULT_SETTINGS.customLuts);
  const [topBarBelow, setTopBarBelow] = useState(DEFAULT_SETTINGS.topBarBelow);
  const [topBarControls, setTopBarControls] = useState(
    DEFAULT_SETTINGS.topBarControls,
  );
  const [projects, setProjects] = useState(DEFAULT_SETTINGS.projects);
  const [activeProjectId, setActiveProjectId] = useState(
    DEFAULT_SETTINGS.activeProjectId,
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await loadStoredSettings(DEFAULT_SETTINGS);

        setRetroStyle(savedSettings.retroStyle);
        setGridVisible(savedSettings.gridVisible);
        setLevelVisible(savedSettings.levelVisible);
        setHistogramVisible(savedSettings.histogramVisible);
        setCompositionScanEnabled(savedSettings.compositionScanEnabled);
        setShutterSound(savedSettings.shutterSound);
        setLocation(savedSettings.location);
        setSaveAsJpeg(savedSettings.saveAsJpeg);
        setSaveOriginalWithoutEffects(savedSettings.saveOriginalWithoutEffects);
        setFirstTime(savedSettings.firstTime);
        setCustomLuts(savedSettings.customLuts);
        setTopBarBelow(savedSettings.topBarBelow);
        setTopBarControls(savedSettings.topBarControls);
        setProjects(savedSettings.projects);
        setActiveProjectId(savedSettings.activeProjectId);

        // 🔄 Sincroniza os projetos salvos com os álbuns reais da biblioteca
        // (remove projetos de álbuns apagados e descobre álbuns novos).
        try {
          const reconciled = await reconcileProjectsWithAlbums(
            savedSettings.projects,
          );
          setProjects(reconciled);
          if (
            savedSettings.activeProjectId &&
            !reconciled.some((p) => p.id === savedSettings.activeProjectId)
          ) {
            setActiveProjectId(null);
          }
        } catch (reconcileError) {
          console.warn("Falha ao reconciliar projetos:", reconcileError);
        }
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

  // Salvar "Nível da Câmera"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.LEVEL_VISIBLE,
        levelVisible.toString(),
      );
    }
  }, [levelVisible, loading]);

  // Salvar "Histograma em tempo real"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.HISTOGRAM_VISIBLE,
        histogramVisible.toString(),
      );
    }
  }, [histogramVisible, loading]);

  // Salvar disponibilidade do Scan de composição.
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.COMPOSITION_SCAN_ENABLED,
        compositionScanEnabled.toString(),
      );
    }
  }, [compositionScanEnabled, loading]);

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

  // No iPhone, HEIF e o formato padrao; JPEG fica como opcao de compatibilidade.
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.SAVE_AS_JPEG,
        saveAsJpeg.toString(),
      );
    }
  }, [saveAsJpeg, loading]);

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

  // 💾 Salvar "Projetos" (álbuns)
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.PROJECTS,
        JSON.stringify(projects),
      );
    }
  }, [projects, loading]);

  // 💾 Salvar "Projeto ativo"
  useEffect(() => {
    if (!loading) {
      saveStoredSetting(
        SETTINGS_STORAGE_KEYS.ACTIVE_PROJECT_ID,
        activeProjectId,
      );
    }
  }, [activeProjectId, loading]);

  const value = {
    retroStyle,
    setRetroStyle,
    gridVisible,
    setGridVisible,
    levelVisible,
    setLevelVisible,
    histogramVisible,
    setHistogramVisible,
    compositionScanEnabled,
    setCompositionScanEnabled,
    loading,
    shutterSound,
    setShutterSound,
    location,
    setLocation,
    saveAsJpeg,
    setSaveAsJpeg,
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
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
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
