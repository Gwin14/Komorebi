import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Platform, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { consumePendingLockedCameraCaptures } from "../modules/camera-control-button";
import BottomControls from "./components/BottomControls";
import CameraPreview from "./components/CameraPreview";
import ExposureSlider from "./components/ExposureSlider";
import ManualControlsPanel from "./components/ManualControlsPanel";
import NativeCapturePreview from "./components/NativeCapturePreview";
import TopBar from "./components/TopBar";
import Welcome from "./components/Welcome";
import { useSettings } from "./context/SettingsContext";
import useCameraBootstrap from "./hooks/useCameraBootstrap";
import useCameraControlButton from "./hooks/useCameraControlButton";
import useCameraGestures from "./hooks/useCameraGestures";
import useCompositionScan from "./hooks/useCompositionScan";
import useCompositionModel from "./hooks/useCompositionModel";
import useControlsAnimation from "./hooks/useControlsAnimation";
import { useDeviceOrientationState } from "./hooks/useDeviceOrientation";
import useManualCameraControls from "./hooks/useManualCameraControls";
import useLivePhotoCapture from "./hooks/useLivePhotoCapture";
import useImageStacking from "./hooks/useImageStacking";
import usePhotoProcessingQueue from "./hooks/usePhotoProcessingQueue";
import usePortraitCapture from "./hooks/usePortraitCapture";
import useRawCapture from "./hooks/useRawCapture";
import useShutterAnimation from "./hooks/useShutterAnimation";
import useVolumeShutter from "./hooks/useVolumeShutter";
import { usePhysicalCameraDevices } from "./hooks/uselensselector";
import styles from "./index.styles";
import {
  buildPhotoProcessingData,
  getLocationExif,
  onCameraReady,
  saveToAlbum,
  takePicture,
} from "./utils/cameraUtils";
import {
  AVAILABLE_GRAINS,
  AVAILABLE_HALATIONS,
  AVAILABLE_LUTS,
  getGrainConfig,
  getHalationConfig,
  LUTProcessor,
} from "./utils/lutProcessor";
import { getProjectById } from "./utils/projects";
import { getAppleStylesCompatibility } from "./utils/photographicStylesPolicy";

export default function App() {
  const {
    retroStyle,
    gridVisible,
    levelVisible,
    histogramVisible,
    previewLut,
    previewHalation,
    previewGrain,
    previewDoubleExposure,
    previewStacking,
    zebraHighlightsEnabled,
    zebraShadowsEnabled,
    compositionScanEnabled,
    intelligentTagsEnabled,
    intelligentFilenameEnabled,
    location,
    saveAsJpeg,
    preserveApplePhotographicStyles,
    firstTime,
    loading,
    saveOriginalWithoutEffects,
    customLuts,
    topBarControls,
    topBarBelow,
    projects,
    activeProjectId,
    setActiveProjectId,
    setProjects,
  } = useSettings();

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(1);
  const [exposure, setExposure] = useState(0);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [doubleCaptureMode, setDoubleCaptureMode] = useState(false);
  const [verticalMode, setVerticalMode] = useState(false);
  const zoomSV = useSharedValue(1);
  const lastZoom = useSharedValue(1);

  const cameraRef = useRef(null);
  const captureInFlightRef = useRef(false);
  const stackingStartInFlightRef = useRef(false);
  const stackingRestoreRef = useRef(null);
  const stackingSwitchInFlightRef = useRef(false);
  const [scanPreviewLayout, setScanPreviewLayout] = useState({ width: 0, height: 0 });
  const { orientation: scanOrientation } = useDeviceOrientationState();
  const [pictureSize, setPictureSize] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeControl, setActiveControl] = useState("none");
  const [stackingFinishing, setStackingFinishing] = useState(false);
  const [stackingSoundSignal, setStackingSoundSignal] = useState(0);

  const [selectedLutId, setSelectedLutId] = useState("none");
  const [selectedGrainId, setSelectedGrainId] = useState("none");
  const [selectedHalationId, setSelectedHalationId] = useState("none");

  const [smileDetectionEnabled, setSmileDetectionEnabled] = useState(false);

  const availableLuts = useMemo(
    () => [...AVAILABLE_LUTS, ...customLuts],
    [customLuts],
  );

  const { lenses, activeLens, activeLensId, setActiveLensId } =
    usePhysicalCameraDevices(facing);

  const manual = useManualCameraControls(activeLens?.device);
  const rawCapture = useRawCapture(activeLens?.device);
  const livePhoto = useLivePhotoCapture(activeLens?.device);
  const portraitCapture = usePortraitCapture(activeLens?.device);
  const imageStacking = useImageStacking(activeLens?.device);
  const compositionModel = useCompositionModel();
  const intelligentModelReady = compositionModel.status.state === "ready";
  const appleStylesCompatibility = useMemo(
    () =>
      getAppleStylesCompatibility({
        preferenceEnabled:
          Platform.OS === "ios" && preserveApplePhotographicStyles,
        livePhotoEnabled: livePhoto.enabled,
        portraitModeEnabled: portraitCapture.enabled,
        rawMode: rawCapture.rawMode,
      }),
    [
      livePhoto.enabled,
      portraitCapture.enabled,
      preserveApplePhotographicStyles,
      rawCapture.rawMode,
    ],
  );
  const nativeCaptureMode = imageStacking.enabled
    ? "stacking"
    : livePhoto.enabled
      ? "live"
      : portraitCapture.enabled
        ? "portrait"
        : null;

  const { cameraPermission, hasMediaPermission, lutsLoaded } =
    useCameraBootstrap({ customLuts, firstTime });

  const effectPreview = useMemo(() => ({
    lutEnabled: previewLut,
    halationEnabled: previewHalation,
    grainEnabled: previewGrain,
    selectedLutId,
    selectedHalationId,
    selectedGrainId,
    lutsLoaded,
  }), [
    previewLut, previewHalation, previewGrain,
    selectedLutId, selectedHalationId, selectedGrainId, lutsLoaded,
  ]);

  const controlsAnim = useControlsAnimation(activeControl);
  const { animateShutter, shutterAnim } = useShutterAnimation();
  const zoomRef = useRef(zoom);
  const autoZoomAnimationRef = useRef(null);
  zoomRef.current = zoom;

  const activeProject = useMemo(
    () => (activeProjectId ? getProjectById(projects, activeProjectId) : null),
    [projects, activeProjectId],
  );

  const {
    enqueueProcessing,
    galleryRefreshKey,
    handleProcessed,
    isProcessing,
    processingQueue,
    removeCurrentProcessing,
    setIsProcessing,
  } = usePhotoProcessingQueue(hasMediaPermission, activeProject, {
    generateTags: intelligentModelReady && intelligentTagsEnabled,
    generateFilename: intelligentModelReady && intelligentFilenameEnabled,
  });

  const cancelAutoZoomAnimation = useCallback(() => {
    const animation = autoZoomAnimationRef.current;
    if (!animation) return;
    cancelAnimationFrame(animation.frameId);
    autoZoomAnimationRef.current = null;
    animation.resolve(false);
  }, []);

  const animateScanZoom = useCallback((targetZoom, duration = 250) => {
    cancelAutoZoomAnimation();
    const initialZoom = zoomRef.current;
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const animation = { frameId: null, resolve };
      autoZoomAnimationRef.current = animation;
      const step = () => {
        if (autoZoomAnimationRef.current !== animation) return;
        const progress = Math.min(1, (Date.now() - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const nextZoom = initialZoom + (targetZoom - initialZoom) * eased;
        zoomRef.current = nextZoom;
        zoomSV.value = nextZoom;
        setZoom(nextZoom);
        if (progress < 1) {
          animation.frameId = requestAnimationFrame(step);
          return;
        }
        autoZoomAnimationRef.current = null;
        resolve(true);
      };
      animation.frameId = requestAnimationFrame(step);
    });
  }, [cancelAutoZoomAnimation, zoomSV]);

  useEffect(() => () => cancelAutoZoomAnimation(), [cancelAutoZoomAnimation]);

  const compositionScan = useCompositionScan({
    featureEnabled:
      !loading && intelligentModelReady && compositionScanEnabled,
    enabled:
      intelligentModelReady && compositionScanEnabled && facing === "back" && !firstTime && !nativeCaptureMode && cameraReady &&
      cameraPermission === "granted" && !isProcessing && processingQueue.length === 0,
    configurationKey: `${activeLens?.device?.id}:${nativeCaptureMode}:${rawCapture.rawMode}:${manual.manualMode}:${verticalMode}:${doubleCaptureMode}:${retroStyle}:${scanOrientation}`,
    preview: {
      ...scanPreviewLayout,
      mirrored: facing === "front",
      rotation: (scanOrientation + 360) % 360,
    },
    zoom,
    minZoom,
    maxZoom,
    onAutoZoom: animateScanZoom,
    onCancelAutoZoom: cancelAutoZoomAnimation,
  });
  const cancelCompositionScan = compositionScan.cancel;
  const handleManualZoomStart = useCallback(() => {
    cancelAutoZoomAnimation();
    cancelCompositionScan();
  }, [cancelAutoZoomAnimation, cancelCompositionScan]);
  const composedGestures = useCameraGestures({
    lastZoom,
    maxZoom,
    minZoom,
    setZoom,
    zoomSV,
    onZoomStart: handleManualZoomStart,
    showLuts: useCallback(() => setActiveControl("lut"), []),
    hideLuts: useCallback(
      () =>
        setActiveControl((current) => (current === "lut" ? "none" : current)),
      [],
    ),
  });

  useEffect(() => {
    if (!hasMediaPermission) return;

    let cancelled = false;

    const importLockedCameraCaptures = async () => {
      try {
        const pendingUris = await consumePendingLockedCameraCaptures();
        if (cancelled || !pendingUris.length) return;

        for (const uri of pendingUris) {
          await saveToAlbum(activeProject, uri);
        }
      } catch (error) {
        console.warn("Erro ao importar capturas da tela bloqueada:", error);
      }
    };

    importLockedCameraCaptures();

    return () => {
      cancelled = true;
    };
  }, [hasMediaPermission, activeProject]);

  useEffect(() => {
    if (
      selectedLutId !== "none" &&
      !availableLuts.some((lut) => lut.id === selectedLutId)
    ) {
      setSelectedLutId("none");
    }
  }, [availableLuts, selectedLutId]);

  // 🆕 Sincronizar zoom quando facing muda (troca câmera frontal/traseira)
  // A lente padrão da frontal é neutralZoom=1
  useEffect(() => {
    cancelAutoZoomAnimation();
    setZoom(1);
    zoomSV.value = 1;
  }, [cancelAutoZoomAnimation, facing, zoomSV]);

  const handleSelectLens = useCallback(
    (lensId) => {
      if (imageStacking.capturing) return;
      if (lensId === activeLensId) return;
      cancelAutoZoomAnimation();
      setZoom(1);
      zoomSV.value = 1;
      setCameraReady(false);
      setActiveLensId(lensId);
    },
    [
      activeLensId,
      cancelAutoZoomAnimation,
      imageStacking.capturing,
      setActiveLensId,
      zoomSV,
    ],
  );

  const handleToggleFacing = useCallback(() => {
    if (imageStacking.capturing) return;
    cancelAutoZoomAnimation();
    setZoom(1);
    zoomSV.value = 1;
    setCameraReady(false);
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, [cancelAutoZoomAnimation, imageStacking.capturing, zoomSV]);

  const toggleMode = useCallback((mode) => {
    setActiveControl((current) => (current === mode ? "none" : mode));
  }, []);

  const toggleVerticalMode = useCallback(() => {
    setVerticalMode((prev) => !prev);
  }, []);

  const handleTakePicture = useCallback(async () => {
    cancelAutoZoomAnimation();
    cancelCompositionScan();
    if (imageStacking.enabled) {
      if (imageStacking.capturing) {
        if (stackingFinishing) return;
        if (["bulb", "motionBlur"].includes(imageStacking.strategyId)) {
          setStackingFinishing(true);
          await imageStacking.stop();
        } else if (imageStacking.strategyId === "doubleExposure") {
          if (imageStacking.progress.state !== "awaitingSecondExposure") return;
          setStackingFinishing(true);
          await imageStacking.advance();
        }
        return;
      }
      if (!cameraReady || isProcessing || !hasMediaPermission || stackingStartInFlightRef.current) return;

      stackingStartInFlightRef.current = true;
      setIsProcessing(true);
      try {
        const result = await imageStacking.start({
          outputFormat:
            Platform.OS === "ios" && !saveAsJpeg ? "heif" : "jpeg",
          previewDoubleExposure,
          previewStacking,
        });
        if (!result) return;
        if (!["bulb", "motionBlur", "doubleExposure"].includes(imageStacking.strategyId)) {
          setStackingSoundSignal((value) => value + 1);
        }
        const additionalExif = await getLocationExif(location);
        enqueueProcessing(
          await buildPhotoProcessingData({
            uri: result.photoUri,
            selectedLutId,
            selectedLut: availableLuts.find(
              (lut) => lut.id === selectedLutId,
            ),
            selectedGrainId,
            selectedGrainConfig: getGrainConfig(selectedGrainId),
            selectedHalationId,
            selectedHalationConfig: getHalationConfig(selectedHalationId),
            lutsLoaded,
            exifData: {
              ...additionalExif,
              aspectRatio: verticalMode ? 9 / 16 : 3 / 4,
            },
            doubleCaptureMode,
            saveOriginalWithoutEffects,
            aspectRatio: verticalMode ? 9 / 16 : 3 / 4,
            captureMode: "stacking",
            stackingMetadata: result,
            preserveApplePhotographicStyles:
              appleStylesCompatibility.effective,
            extraData: {
              outputFormat:
                Platform.OS === "ios" && !saveAsJpeg ? "heif" : "jpeg",
            },
          }),
        );
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("cancel")) {
          console.error("Erro no Image Stacking:", error);
          Alert.alert(
            "Falha no Image Stacking",
            "Não foi possível concluir a composição dos frames.",
          );
        }
      } finally {
        stackingStartInFlightRef.current = false;
        setStackingFinishing(false);
        setIsProcessing(false);
      }
      return;
    }

    if (flash === "on" && !activeLens?.device?.hasFlash) {
      Alert.alert(
        "Flash indisponível",
        "A lente selecionada não possui flash. Desative o flash ou escolha outra lente.",
      );
      return;
    }

    if (captureInFlightRef.current || isProcessing || !cameraReady) return;
    captureInFlightRef.current = true;
    animateShutter();

    const manualSettings =
      manual.manualMode === "manual"
        ? {
            iso: manual.isoAuto ? null : manual.manualISO,
            shutterSeconds: manual.shutterAuto
              ? null
              : manual.manualShutterSeconds,
            wbKelvin: manual.wbAuto ? null : manual.manualWBKelvin,
          }
        : null;

    try {
      await takePicture({
      cameraRef,
      cameraReady,
      isProcessing,
      setIsProcessing,
      selectedLutId,
      selectedLut: availableLuts.find((lut) => lut.id === selectedLutId),
      selectedGrainId,
      selectedGrainConfig: getGrainConfig(selectedGrainId),
      selectedHalationId,
      selectedHalationConfig: getHalationConfig(selectedHalationId),
      lutsLoaded,
      hasMediaPermission,
      flash,
      setProcessingData: enqueueProcessing,
      location,
      doubleCaptureMode,
      saveOriginalWithoutEffects,
      aspectRatio: verticalMode ? 9 / 16 : 3 / 4,
      manualSettings,
      rawMode: rawCapture.rawMode,
      livePhotoEnabled: livePhoto.enabled,
      livePhotoDeviceId: activeLens?.device?.id,
      portraitModeEnabled: portraitCapture.enabled,
      portraitDeviceId: activeLens?.device?.id,
      outputFormat:
        Platform.OS === "ios" &&
        (preserveApplePhotographicStyles || !saveAsJpeg)
          ? "heif"
          : "jpeg",
      preserveApplePhotographicStyles:
        appleStylesCompatibility.effective,
      });
    } finally {
      captureInFlightRef.current = false;
    }
  }, [
    activeLens,
    cancelAutoZoomAnimation,
    cancelCompositionScan,
    animateShutter,
    availableLuts,
    cameraReady,
    doubleCaptureMode,
    enqueueProcessing,
    flash,
    hasMediaPermission,
    isProcessing,
    location,
    lutsLoaded,
    manual.isoAuto,
    manual.manualISO,
    manual.manualMode,
    manual.manualShutterSeconds,
    manual.manualWBKelvin,
    manual.shutterAuto,
    manual.wbAuto,
    livePhoto.enabled,
    portraitCapture.enabled,
    rawCapture.rawMode,
    saveAsJpeg,
    preserveApplePhotographicStyles,
    appleStylesCompatibility.effective,
    saveOriginalWithoutEffects,
    selectedGrainId,
    selectedHalationId,
    selectedLutId,
    previewDoubleExposure,
    previewStacking,
    setIsProcessing,
    verticalMode,
    imageStacking,
    stackingFinishing,
  ]);

  const handleSelectImageStackingStrategy = useCallback(
    async (strategyId) => {
      if (imageStacking.capturing || stackingSwitchInFlightRef.current) return;
      if (strategyId === imageStacking.strategyId) return;
      stackingSwitchInFlightRef.current = true;
      try {
        if (!strategyId && imageStacking.enabled) {
          await imageStacking.deactivateSession();
        }
        if (Boolean(strategyId) !== imageStacking.enabled) {
          setCameraReady(false);
        }
        if (strategyId) {
          if (!imageStacking.enabled) {
            stackingRestoreRef.current = {
              rawMode: rawCapture.rawMode,
              livePhoto: livePhoto.enabled,
              portrait: portraitCapture.enabled,
              flash,
              smile: smileDetectionEnabled,
              manual: manual.manualMode === "manual",
            };
          }
          rawCapture.setRawMode("off");
          livePhoto.setEnabled(false);
          portraitCapture.setEnabled(false);
          setFlash("off");
          setSmileDetectionEnabled(false);
          if (manual.manualMode === "manual") manual.toggleManualMode();
        } else if (imageStacking.enabled && stackingRestoreRef.current) {
          const previous = stackingRestoreRef.current;
          stackingRestoreRef.current = null;
          if (previous.rawMode !== "off" && rawCapture.available) {
            rawCapture.setRawMode(previous.rawMode);
          } else if (previous.livePhoto && livePhoto.available) {
            livePhoto.setEnabled(true);
          } else if (previous.portrait && portraitCapture.available) {
            portraitCapture.setEnabled(true);
          }
          if (previous.flash !== "off" && activeLens?.device?.hasFlash) {
            setFlash(previous.flash);
          }
          setSmileDetectionEnabled(previous.smile);
          if (previous.manual && manual.available && manual.manualMode !== "manual") {
            manual.toggleManualMode();
          }
        }
        imageStacking.selectStrategy(strategyId);
        setActiveControl("none");
      } finally {
        stackingSwitchInFlightRef.current = false;
      }
    },
    [
      activeLens?.device?.hasFlash,
      flash,
      imageStacking,
      livePhoto,
      manual,
      portraitCapture,
      rawCapture,
      smileDetectionEnabled,
    ],
  );

  const handleCameraReady = useCallback(() => {
    if (nativeCaptureMode) {
      setPictureSize(null);
      setCameraReady(true);
      return;
    }

    onCameraReady(cameraRef, setPictureSize, setCameraReady);
  }, [nativeCaptureMode]);

  useEffect(() => {
    setCameraReady(false);
  }, [
    activeLens?.device?.id,
    nativeCaptureMode,
    rawCapture.rawModeEnabled,
  ]);

  useEffect(() => {
    if (!rawCapture.rawModeEnabled) return;
    livePhoto.setEnabled(false);
    portraitCapture.setEnabled(false);
  }, [livePhoto, portraitCapture, rawCapture.rawModeEnabled]);

  useVolumeShutter({
    enabled: !firstTime && cameraPermission === "granted" && cameraReady,
    onVolumeChange: handleTakePicture,
  });

  useCameraControlButton({
    enabled: !firstTime && cameraPermission === "granted" && cameraReady,
    onPress: handleTakePicture,
  });

  const handleChangeProject = useCallback(
    (projectId) => {
      if (projectId === activeProjectId) return;
      setActiveProjectId(projectId);
    },
    [activeProjectId, setActiveProjectId],
  );

  const handleCreateProject = useCallback(
    (project) => {
      setProjects((prev) => [...prev, project]);
      setActiveProjectId(project.id);
    },
    [setActiveProjectId, setProjects],
  );

  const topBarProps = {
    activeControl,
    doubleCaptureMode,
    firstTime,
    flash,
    manualControlsAvailable: manual.available,
    manualMode: manual.manualMode,
    rawCaptureAvailable: rawCapture.available && !imageStacking.enabled,
    rawMode: rawCapture.rawMode,
    livePhotoAvailable:
      livePhoto.available &&
      !rawCapture.rawModeEnabled &&
      !portraitCapture.enabled &&
      !imageStacking.enabled,
    livePhotoEnabled: livePhoto.enabled,
    portraitCaptureAvailable:
      portraitCapture.available &&
      !rawCapture.rawModeEnabled &&
      !livePhoto.enabled &&
      !imageStacking.enabled,
    portraitModeEnabled: portraitCapture.enabled,
    unavailableReasons: {
      manual: imageStacking.enabled
        ? "Desative Image Stacking para usar controles manuais."
        : null,
      flash: imageStacking.enabled
        ? "O flash não está disponível durante Image Stacking."
        : activeLens?.device?.hasFlash
          ? null
          : "A lente selecionada não possui flash.",
      rawCapture: imageStacking.enabled
        ? "Desative Image Stacking para usar RAW/ProRAW."
        : rawCapture.available
          ? null
          : "RAW/ProRAW não é suportado pela lente selecionada.",
      livePhoto: livePhoto.available
        ? imageStacking.enabled
          ? "Desative Image Stacking para usar Live Photo."
          : rawCapture.rawModeEnabled
          ? "Desative RAW/ProRAW para usar Live Photo."
          : portraitCapture.enabled
            ? "Desative o modo retrato para usar Live Photo."
            : null
        : "Live Photo não é suportada pela lente selecionada.",
      portrait: portraitCapture.available
        ? imageStacking.enabled
          ? "Desative Image Stacking para usar o modo retrato."
          : rawCapture.rawModeEnabled
          ? "Desative RAW/ProRAW para usar o modo retrato."
          : livePhoto.enabled
            ? "Desative Live Photo para usar o modo retrato."
            : null
        : "O modo retrato não é suportado pela lente selecionada.",
    },
    imageStackingAvailable: imageStacking.available,
    imageStackingStrategyId: imageStacking.strategyId,
    onSelectImageStackingStrategy: handleSelectImageStackingStrategy,
    selectedLutId,
    smileDetectionEnabled,
    toggleDoubleCaptureMode: () => setDoubleCaptureMode((value) => !value),
    toggleFlash: () => setFlash((value) => (value === "off" ? "on" : "off")),
    toggleMode: (mode) => {
      toggleMode(mode);
      if (mode === "manual") manual.toggleManualMode();
    },
    toggleRawMode: rawCapture.toggleRawMode,
    toggleLivePhotoEnabled: () => {
      setCameraReady(false);
      if (!livePhoto.enabled) portraitCapture.setEnabled(false);
      livePhoto.toggleEnabled();
    },
    togglePortraitModeEnabled: () => {
      setCameraReady(false);
      if (!portraitCapture.enabled) livePhoto.setEnabled(false);
      portraitCapture.toggleEnabled();
    },
    toggleSmileDetectionEnabled: () =>
      setSmileDetectionEnabled((value) => !value),
    toggleVerticalMode,
    topBarControls,
    verticalMode,
    projects,
    activeProjectId,
    onChangeProject: handleChangeProject,
    onCreateProject: handleCreateProject,
    controlsDisabled: imageStacking.capturing,
    stackingProgress: imageStacking.progress,
    onCancelStacking: imageStacking.cancel,
  };

  if (loading) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shutterOverlay,
          {
            opacity: shutterAnim,
          },
        ]}
      />
      <View style={styles.hiddenProcessor}>
        <LUTProcessor
          imageData={processingQueue[0] ?? null}
          onProcessed={handleProcessed}
          onError={removeCurrentProcessing}
        />
      </View>

      {/* {isProcessing && <View style={styles.processingOverlay} />} */}
      {firstTime && <Welcome />}

      {!topBarBelow && <TopBar {...topBarProps} />}

      {!firstTime && cameraPermission === "granted" && (
        <GestureDetector gesture={composedGestures}>
          <View style={styles.previewContainer}>
            {nativeCaptureMode ? (
              <NativeCapturePreview
                mode={nativeCaptureMode}
                retroStyle={retroStyle}
                device={activeLens?.device}
                flash={flash}
                onCameraReady={handleCameraReady}
                gridVisible={gridVisible}
                levelVisible={levelVisible}
                histogramVisible={histogramVisible}
                zebraHighlightsEnabled={zebraHighlightsEnabled}
                zebraShadowsEnabled={zebraShadowsEnabled}
                exposure={exposure}
                verticalMode={verticalMode}
                doubleCaptureMode={doubleCaptureMode}
                smileDetectionEnabled={smileDetectionEnabled}
                onSmileDetected={handleTakePicture}
                onStackingProgress={imageStacking.handleProgress}
                effectPreview={effectPreview}
                previewDoubleExposure={previewDoubleExposure}
                previewStacking={previewStacking}
              />
            ) : (
              <CameraPreview
                retroStyle={retroStyle}
                cameraRef={cameraRef}
                facing={facing}
                device={activeLens?.device}
                flash={flash}
                zoom={zoom}
                exposure={exposure}
                pictureSize={pictureSize}
                onCameraReady={handleCameraReady}
                gridVisible={gridVisible}
                levelVisible={levelVisible}
                histogramVisible={histogramVisible}
                zebraHighlightsEnabled={zebraHighlightsEnabled}
                zebraShadowsEnabled={zebraShadowsEnabled}
                setMinZoom={setMinZoom}
                setMaxZoom={setMaxZoom}
                onSmileDetected={handleTakePicture}
                smileDetectionEnabled={smileDetectionEnabled}
                location={location}
                verticalMode={verticalMode}
                doubleCaptureMode={doubleCaptureMode}
                isActive={!firstTime}
                manualPhotoMode={manual.manualMode === "manual"}
                manualExposureActive={
                  manual.manualMode === "manual" &&
                  (!manual.isoAuto || !manual.shutterAuto)
                }
                rawPhotoMode={rawCapture.rawModeEnabled}
                onFocusAtPoint={manual.focusAtPoint}
                compositionScan={compositionScan}
                onPreviewLayout={setScanPreviewLayout}
                effectPreview={effectPreview}
              />
            )}
          </View>
        </GestureDetector>
      )}

      {appleStylesCompatibility.suspensionReason && (
        <View style={styles.appleStylesPaused} pointerEvents="none">
          <Text style={styles.appleStylesPausedText}>
            Estilos Apple pausados: {appleStylesCompatibility.suspensionReason}
          </Text>
        </View>
      )}

      {!firstTime &&
        cameraPermission !== null &&
        cameraPermission !== "granted" && (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionTitle}>
              Permissão de câmera necessária
            </Text>

            <Text style={styles.permissionText}>
              Autorize o acesso à câmera para usar o app.
            </Text>
          </View>
        )}

      {topBarBelow && (
        <View style={styles.topBarBelow}>
          <TopBar {...topBarProps} />
        </View>
      )}

      {manual.manualMode === "manual" && !imageStacking.enabled ? (
        <ManualControlsPanel
          manual={manual}
          topBarBelow={topBarBelow}
          exposure={exposure}
          setExposure={setExposure}
        />
      ) : (
        <ExposureSlider
          exposure={exposure}
          setExposure={setExposure}
          topBarBelow={topBarBelow}
          activeControl={activeControl}
        />
      )}

      <BottomControls
        controlsAnim={controlsAnim}
        activeControl={activeControl}
        takePicture={handleTakePicture}
        onToggleFacing={handleToggleFacing}
        zoom={zoom}
        setZoom={setZoom}
        onZoomStart={handleManualZoomStart}
        exposure={exposure}
        setExposure={setExposure}
        selectedLutId={selectedLutId}
        setSelectedLutId={setSelectedLutId}
        selectedGrainId={selectedGrainId}
        setSelectedGrainId={setSelectedGrainId}
        selectedHalationId={selectedHalationId}
        setSelectedHalationId={setSelectedHalationId}
        zoomSV={zoomSV}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onSliderRelease={() => toggleMode("none")}
        availableLuts={availableLuts}
        availableGrains={AVAILABLE_GRAINS}
        availableHalations={AVAILABLE_HALATIONS}
        isProcessing={isProcessing}
        showProcessingFeedback={isProcessing && (!imageStacking.capturing || stackingFinishing)}
        processingQueueLength={processingQueue.length}
        lenses={lenses}
        activeLensId={activeLensId}
        onSelectLens={handleSelectLens}
        galleryRefreshKey={galleryRefreshKey}
        activeProject={activeProject}
        imageStackingCapturing={imageStacking.capturing}
        imageStackingFinishing={stackingFinishing}
        imageStackingStrategyId={imageStacking.strategyId}
        imageStackingProgressState={imageStacking.progress.state}
        stackingSoundSignal={stackingSoundSignal}
        imageStackingContinuousCapturing={
          imageStacking.capturing &&
          ["bulb", "motionBlur", "doubleExposure"].includes(imageStacking.strategyId)
        }
      />
    </SafeAreaView>
  );
}
