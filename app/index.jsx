import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDebugState } from "../modules/camera-manual-controls";
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
import useControlsAnimation from "./hooks/useControlsAnimation";
import useManualCameraControls from "./hooks/useManualCameraControls";
import useLivePhotoCapture from "./hooks/useLivePhotoCapture";
import usePhotoProcessingQueue from "./hooks/usePhotoProcessingQueue";
import usePortraitCapture from "./hooks/usePortraitCapture";
import useRawCapture from "./hooks/useRawCapture";
import useShutterAnimation from "./hooks/useShutterAnimation";
import useVolumeShutter from "./hooks/useVolumeShutter";
import { usePhysicalCameraDevices } from "./hooks/uselensselector";
import styles from "./index.styles";
import { onCameraReady, takePicture } from "./utils/cameraUtils";
import { AVAILABLE_LUTS, LUTProcessor } from "./utils/lutProcessor";

export default function App() {
  const {
    retroStyle,
    gridVisible,
    location,
    firstTime,
    loading,
    saveOriginalWithLUT,
    customLuts,
    topBarControls,
    topBarBelow,
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
  const [pictureSize, setPictureSize] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeControl, setActiveControl] = useState("none");

  const [selectedLutId, setSelectedLutId] = useState("none");

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
  const nativeCaptureMode = livePhoto.enabled
    ? "live"
    : portraitCapture.enabled
      ? "portrait"
      : null;

  const { cameraPermission, hasMediaPermission, lutsLoaded } =
    useCameraBootstrap({ customLuts, firstTime });

  const controlsAnim = useControlsAnimation(activeControl);
  const { animateShutter, shutterAnim } = useShutterAnimation();
  const composedGestures = useCameraGestures({
    lastZoom,
    maxZoom,
    minZoom,
    setZoom,
    zoomSV,
    showLuts: useCallback(() => setActiveControl("lut"), []),
    hideLuts: useCallback(
      () =>
        setActiveControl((current) => (current === "lut" ? "none" : current)),
      [],
    ),
  });

  const {
    enqueueProcessing,
    galleryRefreshKey,
    handleProcessed,
    isProcessing,
    processingQueue,
    removeCurrentProcessing,
    setIsProcessing,
  } = usePhotoProcessingQueue(hasMediaPermission);

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
    setZoom(1);
    zoomSV.value = 1;
  }, [facing, zoomSV]);

  const handleSelectLens = useCallback(
    (lensId) => {
      if (lensId === activeLensId) return;
      setZoom(1);
      zoomSV.value = 1;
      setCameraReady(false);
      setActiveLensId(lensId);
    },
    [activeLensId, setActiveLensId, zoomSV],
  );

  const handleToggleFacing = useCallback(() => {
    setZoom(1);
    zoomSV.value = 1;
    setCameraReady(false);
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, [zoomSV]);

  const toggleMode = useCallback((mode) => {
    setActiveControl((current) => (current === mode ? "none" : mode));
  }, []);

  const toggleVerticalMode = useCallback(() => {
    setVerticalMode((prev) => !prev);
  }, []);

  const handleTakePicture = useCallback(() => {
    if (flash === "on" && !activeLens?.device?.hasFlash) {
      Alert.alert(
        "Flash indisponível",
        "A lente selecionada não possui flash. Desative o flash ou escolha outra lente.",
      );
      return;
    }

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

    // DEBUG temporário: confere o estado real do AVCaptureDevice no
    // instante do disparo, pra ver se o exposureMode ainda é custom ou se
    // algo já resetou pra auto antes da captura.
    if (manualSettings && activeLens?.device?.id) {
      getDebugState(activeLens.device.id).then((state) => {
        console.log("[ManualDebug] estado no disparo:", state);
        console.log("[ManualDebug] slider mostrava:", manualSettings);
      });
    }

    takePicture({
      cameraRef,
      cameraReady,
      isProcessing,
      setIsProcessing,
      selectedLutId,
      selectedLut: availableLuts.find((lut) => lut.id === selectedLutId),
      lutsLoaded,
      hasMediaPermission,
      flash,
      setProcessingData: enqueueProcessing,
      location,
      doubleCaptureMode,
      saveOriginalWithLUT,
      aspectRatio: verticalMode ? 9 / 16 : 3 / 4,
      manualSettings,
      rawMode: rawCapture.rawMode,
      livePhotoEnabled: livePhoto.enabled,
      livePhotoDeviceId: activeLens?.device?.id,
      portraitModeEnabled: portraitCapture.enabled,
      portraitDeviceId: activeLens?.device?.id,
    });
  }, [
    activeLens,
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
    saveOriginalWithLUT,
    selectedLutId,
    setIsProcessing,
    verticalMode,
  ]);

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
  }, [activeLens?.device?.id, rawCapture.rawModeEnabled]);

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

  const topBarProps = {
    activeControl,
    doubleCaptureMode,
    firstTime,
    flash,
    manualControlsAvailable: manual.available,
    manualMode: manual.manualMode,
    rawCaptureAvailable: rawCapture.available,
    rawMode: rawCapture.rawMode,
    livePhotoAvailable:
      livePhoto.available &&
      !rawCapture.rawModeEnabled &&
      !portraitCapture.enabled,
    livePhotoEnabled: livePhoto.enabled,
    portraitCaptureAvailable:
      portraitCapture.available &&
      !rawCapture.rawModeEnabled &&
      !livePhoto.enabled,
    portraitModeEnabled: portraitCapture.enabled,
    unavailableReasons: {
      flash: activeLens?.device?.hasFlash
        ? null
        : "A lente selecionada não possui flash.",
      rawCapture: rawCapture.available
        ? null
        : "RAW/ProRAW não é suportado pela lente selecionada.",
      livePhoto: livePhoto.available
        ? rawCapture.rawModeEnabled
          ? "Desative RAW/ProRAW para usar Live Photo."
          : portraitCapture.enabled
          ? "Desative o modo retrato para usar Live Photo."
          : null
        : "Live Photo não é suportada pela lente selecionada.",
      portrait: portraitCapture.available
        ? rawCapture.rawModeEnabled
          ? "Desative RAW/ProRAW para usar o modo retrato."
          : livePhoto.enabled
          ? "Desative Live Photo para usar o modo retrato."
          : null
        : "O modo retrato não é suportado pela lente selecionada.",
    },
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
  };

  if (loading) return null;

  return (
    <SafeAreaView style={styles.container}>
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
                verticalMode={verticalMode}
                doubleCaptureMode={doubleCaptureMode}
                smileDetectionEnabled={smileDetectionEnabled}
                onSmileDetected={handleTakePicture}
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
                setMinZoom={setMinZoom}
                setMaxZoom={setMaxZoom}
                onSmileDetected={handleTakePicture}
                smileDetectionEnabled={smileDetectionEnabled}
                location={location}
                verticalMode={verticalMode}
                doubleCaptureMode={doubleCaptureMode}
                isActive={!firstTime}
                manualPhotoMode={manual.manualMode === "manual"}
                rawPhotoMode={rawCapture.rawModeEnabled}
                onFocusAtPoint={manual.focusAtPoint}
              />
            )}
          </View>
        </GestureDetector>
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

      {manual.manualMode === "manual" ? (
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

      <BottomControls
        controlsAnim={controlsAnim}
        activeControl={activeControl}
        takePicture={handleTakePicture}
        onToggleFacing={handleToggleFacing}
        zoom={zoom}
        setZoom={setZoom}
        exposure={exposure}
        setExposure={setExposure}
        selectedLutId={selectedLutId}
        setSelectedLutId={setSelectedLutId}
        zoomSV={zoomSV}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onSliderRelease={() => toggleMode("none")}
        availableLuts={availableLuts}
        isProcessing={isProcessing}
        processingQueueLength={processingQueue.length}
        lenses={lenses}
        activeLensId={activeLensId}
        onSelectLens={handleSelectLens}
        galleryRefreshKey={galleryRefreshKey}
      />
    </SafeAreaView>
  );
}
