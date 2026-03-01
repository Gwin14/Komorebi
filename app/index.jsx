import { Camera } from "react-native-vision-camera";

import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Button,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import BottomControls from "./components/BottomControls";
import CameraPreview from "./components/CameraPreview";
import TopBar from "./components/TopBar";
import Welcome from "./components/Welcome";
import { useSettings } from "./context/SettingsContext";
import { onCameraReady, saveToAlbum, takePicture } from "./utils/cameraUtils";
import { loadAllLUTs, LUTProcessor } from "./utils/lutProcessor";

export default function App() {
  const {
    retroStyle,
    gridVisible,
    location,
    firstTime,
    // setFirstTime,
    loading,
  } = useSettings();

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const zoomSV = useSharedValue(0);
  const lastZoom = useSharedValue(0);

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

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      lastZoom.value = zoomSV.value;
    })
    .onUpdate((e) => {
      const scale = e.scale;

      const min = minZoom;
      const max = maxZoom;

      const normalized = (lastZoom.value - min) / (max - min);

      // 🔧 Ajuste a sensibilidade do zoom aqui:
      // 0.25 = menos sensível | 0.4 = médio | 0.6+ = mais rápido
      const newNormalized = Math.min(
        Math.max(normalized + (scale - 1) * 0.25, 0),
        1
      );

      const newZoom = min + newNormalized * (max - min);

      zoomSV.value = newZoom;
      runOnJS(setZoom)(newZoom);
    });

  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);

      const permission = await Camera.requestCameraPermission();
      console.log("Camera permission status:", permission);
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
    });
  };

  const handleProcessed = async (processedUri) => {
    try {
      if (hasMediaPermission) await saveToAlbum(processedUri);
    } finally {
      setProcessingQueue((prev) => prev.slice(1));
    }
  };

  if (loading) return null; // ou splash

  if (cameraPermission === null) return <View />;
  if (cameraPermission !== "authorized" && cameraPermission !== "granted") {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.message}>
            É preciso permissão da câmera para usar o app 🤠, se não tiver
            aceito, vá nas configurações
          </Text>
          <Button
            onPress={Linking.openSettings}
            color="#ffaa00"
            title="Dar permissão"
          />
        </View>
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

      {firstTime && <Welcome />}

      <TopBar
        flash={flash}
        toggleFlash={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        toggleMode={toggleMode}
        activeControl={activeControl}
        selectedLutId={selectedLutId}
      />

      <GestureDetector gesture={pinchGesture}>
        {/* <Animated.View style={styles.container}> */}
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
        />
        {/* </Animated.View> */}
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

      {/* <Button
        title="🔁 Reset Welcome"
        onPress={async () => {
          await AsyncStorage.setItem("@settings/firstTime", "true");
          setFirstTime(true);
        }}
      /> */}
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
  message: {
    color: "white",
    textAlign: "center",
    marginBottom: 20,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  messageContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffaa00",
    borderRadius: 10,
    padding: 20,
    margin: 20,
  },
});
