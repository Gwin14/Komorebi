import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomControls from "./components/BottomControls";
import CameraPreview from "./components/CameraPreview";
import ExposureSlider from "./components/ExposureSlider";
import TopBar from "./components/TopBar";
import Welcome from "./components/Welcome";
import { useSettings } from "./context/SettingsContext";
import useCameraBootstrap from "./hooks/useCameraBootstrap";
import useCameraGestures from "./hooks/useCameraGestures";
import useControlsAnimation from "./hooks/useControlsAnimation";
import usePhotoProcessingQueue from "./hooks/usePhotoProcessingQueue";
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
      () => setActiveControl((current) => (current === "lut" ? "none" : current)),
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

  const toggleMode = useCallback((mode) => {
    setActiveControl((current) => (current === mode ? "none" : mode));
  }, []);

  const toggleVerticalMode = useCallback(() => {
    setVerticalMode((prev) => !prev);
  }, []);

  const handleTakePicture = useCallback(() => {
    animateShutter();

    takePicture({
      cameraRef,
      cameraReady,
      isProcessing,
      setIsProcessing,
      selectedLutId,
      lutsLoaded,
      hasMediaPermission,
      flash,
      setProcessingData: enqueueProcessing,
      location,
      doubleCaptureMode,
      saveOriginalWithLUT,
      aspectRatio: verticalMode ? 9 / 16 : 3 / 4,
    });
  }, [
    animateShutter,
    cameraReady,
    doubleCaptureMode,
    enqueueProcessing,
    flash,
    hasMediaPermission,
    isProcessing,
    location,
    lutsLoaded,
    saveOriginalWithLUT,
    selectedLutId,
    setIsProcessing,
    verticalMode,
  ]);

  const handleCameraReady = useCallback(() => {
    onCameraReady(cameraRef, setPictureSize, setCameraReady);
  }, []);

  useVolumeShutter({
    enabled: !firstTime && cameraPermission === "granted" && cameraReady,
    onVolumeChange: handleTakePicture,
  });

  const topBarProps = {
    activeControl,
    doubleCaptureMode,
    firstTime,
    flash,
    selectedLutId,
    smileDetectionEnabled,
    toggleDoubleCaptureMode: () => setDoubleCaptureMode((value) => !value),
    toggleFlash: () => setFlash((value) => (value === "off" ? "on" : "off")),
    toggleMode,
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
      {processingQueue.length > 0 && (
        <View style={styles.hiddenProcessor}>
          <LUTProcessor
            imageData={processingQueue[0]}
            onProcessed={handleProcessed}
            onError={removeCurrentProcessing}
          />
        </View>
      )}

      {/* {isProcessing && <View style={styles.processingOverlay} />} */}
      {firstTime && <Welcome />}

      {!topBarBelow && <TopBar {...topBarProps} />}

      {!firstTime && cameraPermission === "granted" && (
        <GestureDetector gesture={composedGestures}>
          <View style={styles.previewContainer}>
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
            />
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

      <ExposureSlider
        exposure={exposure}
        setExposure={setExposure}
        topBarBelow={topBarBelow}
      />

      <BottomControls
        controlsAnim={controlsAnim}
        activeControl={activeControl}
        takePicture={handleTakePicture}
        setFacing={setFacing}
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
        onSelectLens={setActiveLensId}
        galleryRefreshKey={galleryRefreshKey}
      />
    </SafeAreaView>
  );
}
