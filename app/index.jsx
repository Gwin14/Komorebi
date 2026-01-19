import { useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import { Animated, Button, StyleSheet, Text, View } from "react-native";

import BottomControls from "./components/BottomControls";
import CameraPreview from "./components/CameraPreview";
import TopBar from "./components/TopBar";
import { useSettings } from "./context/SettingsContext";
import { onCameraReady, saveToAlbum, takePicture } from "./utils/cameraUtils";
import { loadAllLUTs, LUTProcessor } from "./utils/lutProcessor";

import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useSharedValue, runOnJS } from "react-native-reanimated";

export default function App() {
  const { retroStyle, gridVisible, location } = useSettings();

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0);
  const zoomSV = useSharedValue(0);
  const lastZoom = useSharedValue(0);

  const cameraRef = useRef(null);
  const [pictureSize, setPictureSize] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeControl, setActiveControl] = useState("none");
  const controlsAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState("none");

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      lastZoom.value = zoomSV.value;
    })
    .onUpdate((e) => {
      let newZoom = lastZoom.value + (e.scale - 1) * 0.25;

      newZoom = Math.min(Math.max(newZoom, 0), 1);

      zoomSV.value = newZoom;

      // 🔥 sincroniza com o state da câmera
      runOnJS(setZoom)(newZoom);
    });

  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);
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
      setProcessingData: (data) =>
        setProcessingQueue((prev) => [...prev, data]),
      location,
    });
  };

  const handleProcessed = async (processedUri) => {
    try {
      if (hasMediaPermission) await saveToAlbum(processedUri);
    } finally {
      setProcessingQueue((prev) => prev.slice(1));
    }
  };

  if (!cameraPermission) return <View />;
  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Precisamos da sua permissão para a câmera
        </Text>
        <Button onPress={requestCameraPermission} title="Dar permissão" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {processingQueue.length > 0 && (
        <LUTProcessor
          imageData={processingQueue[0]}
          onProcessed={handleProcessed}
          onError={() => setProcessingQueue((prev) => prev.slice(1))}
        />
      )}

      {isProcessing && <View style={styles.processingOverlay} />}

      <TopBar
        flash={flash}
        toggleFlash={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        toggleMode={toggleMode}
        activeControl={activeControl}
        selectedLutId={selectedLutId}
      />

      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={styles.container}>
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
          />
        </Animated.View>
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  message: { color: "white", textAlign: "center", marginBottom: 20 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
});
