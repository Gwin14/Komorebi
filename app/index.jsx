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

export default function App() {
  const { retroStyle, gridVisible, location } = useSettings();

  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0);
  const cameraRef = useRef(null);
  const [pictureSize, setPictureSize] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeControl, setActiveControl] = useState("none");
  const controlsAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  const [processingData, setProcessingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState("none");

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
      setProcessingData,
      location,
    });
  };

  const handleProcessed = async (processedUri) => {
    try {
      if (hasMediaPermission) await saveToAlbum(processedUri);
    } finally {
      setProcessingData(null);
      setIsProcessing(false);
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
      {processingData && (
        <LUTProcessor
          imageData={processingData}
          onProcessed={handleProcessed}
          onError={() => setIsProcessing(false)}
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
