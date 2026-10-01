import { getHeifPlusPolicy } from "./utils/heifPlusSettings";
import { isHeifPlusAvailable } from "../modules/camera-raw-capture";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Platform, Pressable, Text, View } from "react-native";
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
import { getProjectById, getProjectAlbumName } from "./utils/projects";
import { getAppleStylesCompatibility } from "./utils/photographicStylesPolicy";
import {
  DEFAULT_ASPECT_RATIO,
  getAspectRatioValue,
} from "./utils/aspectRatios";

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
    photoAuthor,
    photoCopyright,
    location,
    saveAsJpeg,
    photoFormat, setPhotoFormat, heifPlusSettings, setHeifPlusSupport,
    setPreserveApplePhotographicStyles,
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

  const {
    cameraPermission,
    hasMediaPermission,
    mediaPermission,
    locationPermission,
    lutsLoaded,
    requestCameraPermission,
    requestMediaPermission,
    requestLocationPermission,
  } = useCameraBootstrap({ customLuts });
  const cameraFeaturesEnabled =
    !firstTime && cameraPermission === "granted";

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(1);
  const [exposure, setExposure] = useState(0);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [doubleCaptureMode, setDoubleCaptureMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [previewAvailableHeight, setPreviewAvailableHeight] = useState(0);
  const captureAspectRatio = getAspectRatioValue(aspectRatio);
  const zoomSV = useSharedValue(1);
  const lastZoom = useSharedValue(1);

  const cameraRef = useRef(null);
  const captureInFlightRef = useRef(false);
  const stackingStartInFlightRef = useRef(false);
  const stackingRestoreRef = useRef(null);
  const stackingSwitchInFlightRef = useRef(false);
  const [scanPreviewLayout, setScanPreviewLayout] = useState({
    width: 0,
    height: 0,
  });
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

  const {
    lenses,
    activeLens,
    activeLensId,
    setActiveLensId,
    refreshZoomCapabilities,
  } = usePhysicalCameraDevices(facing, cameraFeaturesEnabled);

  const captureDevice = cameraFeaturesEnabled ? activeLens?.device : null;
  const manual = useManualCameraControls(captureDevice);
  const rawCapture = useRawCapture(captureDevice);
  const livePhoto = useLivePhotoCapture(captureDevice);
  const portraitCapture = usePortraitCapture(captureDevice);
  const imageStacking = useImageStacking(captureDevice);
  const heifPlusPolicy = getHeifPlusPolicy({
    photoFormat: rawCapture.processedEnabled ? photoFormat : null, rawMode: rawCapture.rawMode,
    capabilities: isHeifPlusAvailable() ? rawCapture.capabilities : null,
    livePhotoEnabled: livePhoto.enabled, portraitModeEnabled: portraitCapture.enabled,
    stackingEnabled: imageStacking.enabled, platform: Platform.OS,
  });
  const compositionModel = useCompositionModel();
  const intelligentModelReady = compositionModel.status.state === "ready";
  const appleStylesCompatibility = useMemo(
    () =>
      getAppleStylesCompatibility({
        preferenceEnabled:
          Platform.OS === "ios" && preserveApplePhotographicStyles,
        livePhotoEnabled: livePhoto.enabled,
        portraitModeEnabled: portraitCapture.enabled,
        rawMode: heifPlusPolicy.effective ? heifPlusPolicy.rawMode : rawCapture.rawMode,
      }),
    [
      livePhoto.enabled,
      portraitCapture.enabled,
      preserveApplePhotographicStyles,
      rawCapture.rawMode, heifPlusPolicy.effective, heifPlusPolicy.rawMode,
    ],
  );
  const nativeCaptureMode = imageStacking.enabled
    ? "stacking"
    : livePhoto.enabled
      ? "live"
      : portraitCapture.enabled
        ? "portrait"
        : null;
  const [renderedNativeCaptureMode, setRenderedNativeCaptureMode] =
    useState(nativeCaptureMode);
  const [cameraHandoffActive, setCameraHandoffActive] = useState(false);
  const pendingNativeCaptureModeRef = useRef(nativeCaptureMode);
  const cameraStopFallbackRef = useRef(null);
  const cameraHandoffTimeoutRef = useRef(null);

  const beginCameraHandoff = useCallback((delay) => {
    if (cameraStopFallbackRef.current) {
      clearTimeout(cameraStopFallbackRef.current);
      cameraStopFallbackRef.current = null;
    }
    if (cameraHandoffTimeoutRef.current) {
      clearTimeout(cameraHandoffTimeoutRef.current);
      cameraHandoffTimeoutRef.current = null;
    }

    // Commit an empty preview first so VisionCamera and its AVCaptureSession
    // are fully destroyed before another session claims the same device.
    setCameraHandoffActive(true);
    cameraHandoffTimeoutRef.current = setTimeout(() => {
      cameraHandoffTimeoutRef.current = null;
      setRenderedNativeCaptureMode(pendingNativeCaptureModeRef.current);
      setCameraHandoffActive(false);
    }, delay);
  }, []);

  useEffect(() => {
    pendingNativeCaptureModeRef.current = nativeCaptureMode;

    if (nativeCaptureMode === renderedNativeCaptureMode) {
      if (cameraHandoffTimeoutRef.current) {
        clearTimeout(cameraHandoffTimeoutRef.current);
        cameraHandoffTimeoutRef.current = null;
      }
      setCameraHandoffActive(false);
      return undefined;
    }

    if (renderedNativeCaptureMode) {
      // Native views stop their AVCaptureSession asynchronously. Remove the
      // old view in one commit, then give stopRunning() time to release the
      // camera before mounting VisionCamera or another native mode.
      beginCameraHandoff(500);
      return undefined;
    }

    // Stop VisionCamera first. Its frame processor and Skia Canvas must drain
    // before React replaces them with one of the native capture previews.
    cameraStopFallbackRef.current = setTimeout(() => {
      cameraStopFallbackRef.current = null;
      beginCameraHandoff(250);
    }, 750);

    return () => {
      if (cameraStopFallbackRef.current) {
        clearTimeout(cameraStopFallbackRef.current);
        cameraStopFallbackRef.current = null;
      }
      if (cameraHandoffTimeoutRef.current) {
        clearTimeout(cameraHandoffTimeoutRef.current);
        cameraHandoffTimeoutRef.current = null;
      }
    };
  }, [beginCameraHandoff, nativeCaptureMode, renderedNativeCaptureMode]);

  const handleCameraStopped = useCallback(() => {
    if (!pendingNativeCaptureModeRef.current) return;
    beginCameraHandoff(250);
  }, [beginCameraHandoff]);

  useEffect(
    () => () => {
      if (cameraStopFallbackRef.current) {
        clearTimeout(cameraStopFallbackRef.current);
      }
      if (cameraHandoffTimeoutRef.current) {
        clearTimeout(cameraHandoffTimeoutRef.current);
      }
    },
    [],
  );

  const handleEssentialPermission = useCallback(async () => {
    if (cameraPermission !== "granted") {
      await requestCameraPermission();
      return;
    }
    if (!hasMediaPermission) await requestMediaPermission();
  }, [
    cameraPermission,
    hasMediaPermission,
    requestCameraPermission,
    requestMediaPermission,
  ]);

  const effectPreview = useMemo(
    () => ({
      lutEnabled: previewLut,
      halationEnabled: previewHalation,
      grainEnabled: previewGrain,
      selectedLutId,
      selectedHalationId,
      selectedGrainId,
      lutsLoaded,
    }),
    [
      previewLut,
      previewHalation,
      previewGrain,
      selectedLutId,
      selectedHalationId,
      selectedGrainId,
      lutsLoaded,
    ],
  );

  const { controlsAnim, displayedControl } =
    useControlsAnimation(activeControl);
  const normalControlsTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });
  const normalControlsOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
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
    heifPlusPendingCount,
    galleryRefreshKey,
    handleProcessed,
    isProcessing,
    processingQueue,
    removeCurrentProcessing,
    setIsProcessing,
  } = usePhotoProcessingQueue(hasMediaPermission, activeProject, {
    author: photoAuthor,
    copyright: photoCopyright,
    generateTags: intelligentModelReady && intelligentTagsEnabled,
    generateFilename: intelligentModelReady && intelligentFilenameEnabled,
    onHeifPlusInspection: setHeifPlusSupport,
  });

  const cancelAutoZoomAnimation = useCallback(() => {
    const animation = autoZoomAnimationRef.current;
    if (!animation) return;
    cancelAnimationFrame(animation.frameId);
    autoZoomAnimationRef.current = null;
    animation.resolve(false);
  }, []);

  const animateScanZoom = useCallback(
    (targetZoom, duration = 250) => {
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
    },
    [cancelAutoZoomAnimation, zoomSV],
  );

  useEffect(() => () => cancelAutoZoomAnimation(), [cancelAutoZoomAnimation]);

  const compositionScan = useCompositionScan({
    featureEnabled: !loading && intelligentModelReady && compositionScanEnabled,
    enabled:
      intelligentModelReady &&
      compositionScanEnabled &&
      facing === "back" &&
      !firstTime &&
      !nativeCaptureMode &&
      cameraReady &&
      cameraPermission === "granted" &&
      !isProcessing &&
      processingQueue.length === 0,
    configurationKey: `${activeLens?.device?.id}:${nativeCaptureMode}:${rawCapture.rawMode}:${manual.manualMode}:${aspectRatio}:${doubleCaptureMode}:${retroStyle}:${scanOrientation}`,
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

  // Cada câmera lógica tem sua própria escala interna. Em aparelhos com
  // ultra-wide, o zoom neutro da câmera principal geralmente não é 1.
  useEffect(() => {
    cancelAutoZoomAnimation();
    const initialZoom =
      activeLens?.zoomFactor ?? activeLens?.device?.neutralZoom ?? 1;
    setZoom(initialZoom);
    zoomSV.value = initialZoom;
  }, [
    activeLens?.device?.id,
    activeLens?.device?.neutralZoom,
    activeLens?.zoomFactor,
    cancelAutoZoomAnimation,
    facing,
    zoomSV,
  ]);

  const handleSelectLens = useCallback(
    (lensId) => {
      if (imageStacking.capturing) return;
      const selectedLens = lenses.find((lens) => lens.id === lensId);
      if (!selectedLens) return;
      const selectedZoom =
        selectedLens.zoomFactor ?? selectedLens.device?.neutralZoom ?? 1;
      cancelAutoZoomAnimation();
      setZoom(selectedZoom);
      zoomSV.value = selectedZoom;
      if (selectedLens.device?.id !== activeLens?.device?.id) {
        setCameraReady(false);
      }
      setActiveLensId(lensId);
    },
    [
      activeLens?.device?.id,
      cancelAutoZoomAnimation,
      imageStacking.capturing,
      lenses,
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
      if (
        !cameraReady ||
        isProcessing ||
        !hasMediaPermission ||
        stackingStartInFlightRef.current
      )
        return;

      stackingStartInFlightRef.current = true;
      setIsProcessing(true);
      try {
        const result = await imageStacking.start({
          outputFormat: Platform.OS === "ios" && !saveAsJpeg ? "heif" : "jpeg",
          previewDoubleExposure,
          previewStacking,
        });
        if (!result) return;
        if (
          !["bulb", "motionBlur", "doubleExposure"].includes(
            imageStacking.strategyId,
          )
        ) {
          setStackingSoundSignal((value) => value + 1);
        }
        const additionalExif = await getLocationExif(location);
        enqueueProcessing(
          await buildPhotoProcessingData({
            uri: result.photoUri,
            selectedLutId,
            selectedLut: availableLuts.find((lut) => lut.id === selectedLutId),
            selectedGrainId,
            selectedGrainConfig: getGrainConfig(selectedGrainId),
            selectedHalationId,
            selectedHalationConfig: getHalationConfig(selectedHalationId),
            lutsLoaded,
            exifData: {
              ...additionalExif,
              aspectRatio: captureAspectRatio,
            },
            doubleCaptureMode,
            saveOriginalWithoutEffects,
            aspectRatio: captureAspectRatio,
            captureMode: "stacking",
            stackingMetadata: result,
            preserveApplePhotographicStyles: appleStylesCompatibility.effective,
            extraData: {
              outputFormat:
                Platform.OS === "ios" && !saveAsJpeg ? "heif" : "jpeg",
            },
          }),
        );
      } catch (error) {
        if (
          !String(error?.message || error)
            .toLowerCase()
            .includes("cancel")
        ) {
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

    if (heifPlusPolicy.effective && heifPlusPendingCount >= 3) {
      Alert.alert("Fila HEIF+ cheia", "Aguarde o processamento ou gerencie as capturas pendentes nas configurações.");
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
        aspectRatio: captureAspectRatio,
        manualSettings,
        rawMode: heifPlusPolicy.rawMode,
        rawPairEnabled: rawCapture.rawModeEnabled && rawCapture.processedEnabled,
        heifPlus: heifPlusPolicy.effective ? {
          settings: heifPlusSettings,
          rawPairEnabled: rawCapture.rawModeEnabled && rawCapture.processedEnabled,
          projectAlbum: activeProject ? getProjectAlbumName(activeProject) : null,
          catalogMetadata: { author: photoAuthor, copyright: photoCopyright },
          intelligence: {
            generateTags: intelligentModelReady && intelligentTagsEnabled,
            generateFilename: intelligentModelReady && intelligentFilenameEnabled,
          },
        } : null,
        livePhotoEnabled: livePhoto.enabled,
        livePhotoDeviceId: activeLens?.device?.id,
        portraitModeEnabled: portraitCapture.enabled,
        portraitDeviceId: activeLens?.device?.id,
        outputFormat:
          Platform.OS === "ios" &&
          (preserveApplePhotographicStyles || !saveAsJpeg)
            ? "heif"
            : "jpeg",
        preserveApplePhotographicStyles: appleStylesCompatibility.effective,
      });
    } catch (error) {
      Alert.alert("Falha na captura HEIF+", String(error.message || error));
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
    heifPlusPolicy.rawMode, heifPlusPolicy.effective, heifPlusSettings, heifPlusPendingCount,
    rawCapture.rawModeEnabled, rawCapture.processedEnabled,
    activeProject, photoAuthor, photoCopyright, intelligentModelReady,
    intelligentTagsEnabled, intelligentFilenameEnabled,
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
    captureAspectRatio,
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
              processedEnabled: rawCapture.processedEnabled,
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
            if (!previous.processedEnabled) rawCapture.toggleFormat("processed");
          } else if (previous.livePhoto && livePhoto.available) {
            livePhoto.setEnabled(true);
          } else if (previous.portrait && portraitCapture.available) {
            portraitCapture.setEnabled(true);
          }
          if (previous.flash !== "off" && activeLens?.device?.hasFlash) {
            setFlash(previous.flash);
          }
          setSmileDetectionEnabled(previous.smile);
          if (
            previous.manual &&
            manual.available &&
            manual.manualMode !== "manual"
          ) {
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
    void refreshZoomCapabilities();
    if (nativeCaptureMode) {
      setPictureSize(null);
      setCameraReady(true);
      return;
    }

    onCameraReady(cameraRef, setPictureSize, setCameraReady);
  }, [nativeCaptureMode, refreshZoomCapabilities]);

  useLayoutEffect(() => {
    // Reset before native readiness events arrive. RAW is a per-photo option;
    // toggling it may leave the session unchanged and emit no new ready event.
    setCameraReady(false);
  }, [activeLens?.device?.id, nativeCaptureMode]);

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
      if (mode === "manual") {
        const disablingManual = manual.manualMode === "manual";
        manual.toggleManualMode();
        setActiveControl(disablingManual ? "none" : "manual");
        return;
      }

      toggleMode(mode);
    },
    photoFormat,
    processedEnabled: rawCapture.processedEnabled,
    supportedRawModes: rawCapture.capabilities?.supportedModes || ["off"],
    heifPlusAvailable: isHeifPlusAvailable(),
    onSelectPhotoFormat: (format) => {
      setPhotoFormat(format);
      if (format === "jpeg") setPreserveApplePhotographicStyles(false);
    },
    onToggleFileFormat: rawCapture.toggleFormat,
    onSelectRawMode: rawCapture.setRawMode,
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
    onSelectAspectRatio: setAspectRatio,
    topBarControls,
    aspectRatio,
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
      {firstTime && (
        <Welcome
          permissions={{
            cameraPermission,
            mediaPermission,
            locationPermission,
            requestCameraPermission,
            requestMediaPermission,
            requestLocationPermission,
          }}
        />
      )}

      {!topBarBelow && <TopBar {...topBarProps} />}

      {!firstTime && cameraPermission === "granted" && (
        <GestureDetector gesture={composedGestures}>
          <View
            style={styles.previewContainer}
            onLayout={(event) =>
              setPreviewAvailableHeight(event.nativeEvent.layout.height)
            }
          >
            {cameraHandoffActive ? null : renderedNativeCaptureMode ? (
              <NativeCapturePreview
                mode={renderedNativeCaptureMode}
                isActive={
                  nativeCaptureMode === renderedNativeCaptureMode &&
                  !cameraHandoffActive
                }
                retroStyle={retroStyle}
                device={activeLens?.device}
                zoomFactor={activeLens?.zoomFactor}
                flash={flash}
                onCameraReady={handleCameraReady}
                gridVisible={gridVisible}
                levelVisible={levelVisible}
                histogramVisible={histogramVisible}
                zebraHighlightsEnabled={zebraHighlightsEnabled}
                zebraShadowsEnabled={zebraShadowsEnabled}
                exposure={exposure}
                aspectRatio={aspectRatio}
                availableHeight={previewAvailableHeight}
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
                aspectRatio={aspectRatio}
                availableHeight={previewAvailableHeight}
                doubleCaptureMode={doubleCaptureMode}
                isActive={!firstTime && !nativeCaptureMode}
                manualPhotoMode={manual.manualMode === "manual"}
                manualExposureActive={
                  manual.manualMode === "manual" &&
                  (!manual.isoAuto || !manual.shutterAuto)
                }
                rawPhotoMode={rawCapture.rawModeEnabled || heifPlusPolicy.effective}
                onRawCapabilities={rawCapture.updateCapabilities}
                onFocusAtPoint={manual.focusAtPoint}
                compositionScan={compositionScan}
                onPreviewLayout={setScanPreviewLayout}
                effectPreview={effectPreview}
                onCameraStopped={handleCameraStopped}
              />
            )}
            {heifPlusPolicy.requested && (
              <View pointerEvents="none" style={styles.permissionBanner}>
                <Text style={styles.permissionBannerText}>
                  {heifPlusPolicy.effective ? "HEIF+ · Revelação RAW personalizada"
                    : `HEIF+ pausado: ${heifPlusPolicy.suspensionReason}`}
                </Text>
              </View>
            )}
            {hasMediaPermission === false && (
              <View style={styles.permissionBanner}>
                <View style={styles.permissionBannerIcon}>
                  <Ionicons name="images-outline" size={22} color="#ffb21d" />
                </View>
                <View style={styles.permissionBannerCopy}>
                  <Text style={styles.permissionBannerTitle}>
                    Permita acesso às fotos
                  </Text>
                  <Text style={styles.permissionBannerText}>
                    O Komorebi precisa salvar as fotos que você fizer.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Permitir acesso à biblioteca de fotos"
                  onPress={requestMediaPermission}
                  style={({ pressed }) => [
                    styles.permissionButtonCompact,
                    pressed && styles.permissionButtonPressed,
                  ]}
                >
                  <Text style={styles.permissionButtonCompactText}>
                    Permitir
                  </Text>
                </Pressable>
              </View>
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
              Câmera e biblioteca de fotos são necessárias para fotografar e
              salvar suas imagens.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conceder permissões essenciais"
              onPress={handleEssentialPermission}
              style={({ pressed }) => [
                styles.permissionButton,
                pressed && styles.permissionButtonPressed,
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={19} color="#111" />
              <Text style={styles.permissionButtonText}>Conceder acesso</Text>
            </Pressable>
          </View>
        )}

      {topBarBelow && (
        <View style={styles.topBarBelow}>
          <TopBar {...topBarProps} />
        </View>
      )}

      <Animated.View
        style={[
          styles.adjustmentControlsSlot,
          {
            opacity: normalControlsOpacity,
            transform: [{ translateY: normalControlsTranslate }],
          },
        ]}
        pointerEvents={
          activeControl === "none" || activeControl === "manual"
            ? "auto"
            : "none"
        }
      >
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
          />
        )}
      </Animated.View>

      <BottomControls
        controlsAnim={controlsAnim}
        displayedControl={displayedControl}
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
        isProcessing={isProcessing || (heifPlusPolicy.effective && heifPlusPendingCount >= 3)}
        showProcessingFeedback={
          isProcessing && (!imageStacking.capturing || stackingFinishing)
        }
        processingQueueLength={Math.max(processingQueue.length, heifPlusPendingCount)}
        galleryRefreshKey={galleryRefreshKey}
        activeProject={activeProject}
        imageStackingCapturing={imageStacking.capturing}
        imageStackingFinishing={stackingFinishing}
        imageStackingStrategyId={imageStacking.strategyId}
        imageStackingProgressState={imageStacking.progress.state}
        stackingSoundSignal={stackingSoundSignal}
        imageStackingContinuousCapturing={
          imageStacking.capturing &&
          ["bulb", "motionBlur", "doubleExposure"].includes(
            imageStacking.strategyId,
          )
        }
        lenses={lenses}
        activeLensId={activeLensId}
        onSelectLens={handleSelectLens}
      />
    </SafeAreaView>
  );
}
