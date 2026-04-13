import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { Camera } from "react-native-vision-camera";
import BottomControls from "./components/BottomControls";
import CameraPreview from "./components/CameraPreview";
import TopBar from "./components/TopBar";
import Welcome from "./components/Welcome";
import { useSettings } from "./context/SettingsContext";
import {
  cropImageToInverseAspect,
  onCameraReady,
  saveToAlbum,
  takePicture,
} from "./utils/cameraUtils";
import { loadAllLUTs, LUTProcessor } from "./utils/lutProcessor";

export default function App() {
  const { retroStyle, gridVisible, location, firstTime, loading } =
    useSettings();

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [doubleCaptureMode, setDoubleCaptureMode] = useState(false);
  const zoomSV = useSharedValue(1);
  const lastZoom = useSharedValue(1);

  const cameraRef = useRef(null);
  const [pictureSize, setPictureSize] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeControl, setActiveControl] = useState("none");
  const controlsAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, setCameraPermission] = useState(null);
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState("none");

  const [smileDetectionEnabled, setSmileDetectionEnabled] = useState(false);

  // --- GESTOS ---

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      lastZoom.value = zoomSV.value;
    })
    .onUpdate((e) => {
      const scale = e.scale;
      const min = minZoom;
      const max = maxZoom;
      const normalized = (lastZoom.value - min) / (max - min);
      const newNormalized = Math.min(
        Math.max(normalized + (scale - 1) * 0.25, 0),
        1,
      );
      const newZoom = min + newNormalized * (max - min);
      zoomSV.value = newZoom;
      runOnJS(setZoom)(newZoom);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      runOnJS(setActiveControl)("zoom");
    });

  const composedGestures = Gesture.Simultaneous(pinchGesture, doubleTapGesture);

  // --- EFEITOS ---

  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);
      const permission = await Camera.requestCameraPermission();
      setCameraPermission(permission);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasMediaPermission(status === "granted");
      await Location.requestForegroundPermissionsAsync();
    })();
  }, []);

  useEffect(() => {
    const showTools = activeControl !== "none";
    Animated.timing(controlsAnim, {
      toValue: showTools ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [activeControl]);

  const toggleMode = (mode) => {
    setActiveControl((current) => (current === mode ? "none" : mode));
  };

  const handleTakePicture = () => {
    takePicture({
      cameraRef,
      cameraReady,
      isProcessing,
      setIsProcessing,
      selectedLutId,
      lutsLoaded,
      hasMediaPermission,
      flash,
      setProcessingData: (data) =>
        setProcessingQueue((prev) => [...prev, data]),
      location,
      doubleCaptureMode,
    });
  };

  useEffect(() => {
    const item = processingQueue[0];
    if (!item || item.needsProcessing) return;

    (async () => {
      await handleProcessed(item.originalUri, item.doubleCaptureMode);
    })();
  }, [processingQueue]);

  const handleProcessed = async (processedUri, doubleCaptureMode = false) => {
    try {
      if (!hasMediaPermission) return;

      if (doubleCaptureMode) {
        await saveToAlbum(processedUri);

        const inverseUri = await cropImageToInverseAspect(processedUri);
        if (inverseUri) await saveToAlbum(inverseUri);
      } else {
        await saveToAlbum(processedUri);
      }
    } catch (error) {
      console.error("Erro ao salvar imagem processada:", error);
    } finally {
      setProcessingQueue((prev) => prev.slice(1));
    }
  };

  if (loading || cameraPermission === null) return null;

  return (
    <View style={styles.container}>
      {processingQueue.length > 0 && (
        <View style={styles.hiddenProcessor}>
          <LUTProcessor
            imageData={processingQueue[0]}
            onProcessed={handleProcessed}
            onError={() => setProcessingQueue((prev) => prev.slice(1))}
          />
        </View>
      )}

      {isProcessing && <View style={styles.processingOverlay} />}
      {firstTime && <Welcome />}

      <TopBar
        flash={flash}
        toggleFlash={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        smileDetectionEnabled={smileDetectionEnabled}
        toggleSmileDetectionEnabled={() => setSmileDetectionEnabled((s) => !s)}
        toggleMode={toggleMode}
        activeControl={activeControl}
        selectedLutId={selectedLutId}
        doubleCaptureMode={doubleCaptureMode}
        toggleDoubleCaptureMode={() => setDoubleCaptureMode((value) => !value)}
      />

      <GestureDetector gesture={composedGestures}>
        <View style={styles.previewContainer}>
          <CameraPreview
            retroStyle={retroStyle}
            cameraRef={cameraRef}
            facing={facing}
            flash={flash}
            zoom={zoom}
            pictureSize={pictureSize}
            onCameraReady={() =>
              onCameraReady(cameraRef, setPictureSize, setCameraReady)
            }
            gridVisible={gridVisible}
            setMinZoom={setMinZoom}
            setMaxZoom={setMaxZoom}
            onSmileDetected={handleTakePicture}
            smileDetectionEnabled={smileDetectionEnabled}
            location={location}
          />
        </View>
      </GestureDetector>

      <BottomControls
        controlsAnim={controlsAnim}
        activeControl={activeControl}
        takePicture={handleTakePicture}
        setFacing={setFacing}
        zoom={zoom}
        setZoom={setZoom}
        selectedLutId={selectedLutId}
        setSelectedLutId={setSelectedLutId}
        zoomSV={zoomSV}
        minZoom={minZoom}
        maxZoom={maxZoom}
        // 🚀 Passamos a função toggleMode para que o slider saiba como se fechar
        onSliderRelease={() => toggleMode("none")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  previewContainer: { flex: 1, width: "100%" },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    zIndex: 2000,
  },
  hiddenProcessor: {
    position: "absolute",
    width: 0,
    height: 0,
    overflow: "hidden",
  },
});
