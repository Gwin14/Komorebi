import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Button,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ExposureDialFinal from "./components/ExposureDialFinal";
import LUTSelector from "./components/LUTSelector";
import Shutter from "./components/shutter";
import {
  applyLUTToImage,
  loadAllLUTs,
  LUTProcessor,
} from "./utils/lutProcessor";

export default function App() {
  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0); // 0 a 1 conforme exigido pela Expo Camera
  const cameraRef = useRef(null);

  const [dial, setDial] = useState(false);
  const dialAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  // Estados de Processamento
  const [processingData, setProcessingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState("none");
  const [showLutSelector, setShowLutSelector] = useState(false);

  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasMediaPermission(status === "granted");
    })();
  }, []);

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

  const takePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      try {
        setIsProcessing(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        });

        if (selectedLutId !== "none" && lutsLoaded) {
          const processingInfo = await applyLUTToImage(
            photo.uri,
            selectedLutId
          );
          if (processingInfo.needsProcessing) {
            setProcessingData(processingInfo);
          } else {
            if (hasMediaPermission)
              await MediaLibrary.saveToLibraryAsync(photo.uri);
            setIsProcessing(false);
          }
        } else {
          if (hasMediaPermission)
            await MediaLibrary.saveToLibraryAsync(photo.uri);
          setIsProcessing(false);
        }
      } catch (error) {
        console.error("Erro ao tirar foto:", error);
        setIsProcessing(false);
      }
    }
  };

  const handleProcessed = async (processedUri) => {
    try {
      if (hasMediaPermission)
        await MediaLibrary.saveToLibraryAsync(processedUri);
    } finally {
      setProcessingData(null);
      setIsProcessing(false);
    }
  };

  const toggleDial = () => {
    Animated.timing(dialAnim, {
      toValue: dial ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setDial(!dial);
  };

  // Interpolações de Animação
  const shutterTranslate = dialAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });
  const dialTranslate = dialAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });
  const dialOpacity = dialAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const shutterOpacity = dialAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.container}>
      {processingData && (
        <LUTProcessor
          imageData={processingData}
          onProcessed={handleProcessed}
          onError={() => setIsProcessing(false)}
        />
      )}

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <Text style={styles.processingText}>Processando...</Text>
        </View>
      )}

      {/* Barra Superior */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        >
          <Ionicons
            name={flash === "off" ? "flash-off-outline" : "flash-outline"}
            size={32}
            color="white"
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleDial}>
          <Ionicons name="aperture-outline" size={32} color="white" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowLutSelector(!showLutSelector)}>
          <Ionicons
            name="color-filter-outline"
            size={32}
            color={selectedLutId !== "none" ? "#ffaa00" : "white"}
          />
        </TouchableOpacity>
      </View>

      {/* Preview Câmera */}
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          facing={facing}
          ref={cameraRef}
          flash={flash}
          zoom={zoom}
        />
      </View>

      {/* Controles Inferiores */}
      <View style={styles.shutterContainer}>
        <Animated.View
          style={[
            styles.shutterRow,
            {
              transform: [{ translateY: shutterTranslate }],
              opacity: shutterOpacity,
            },
          ]}
        >
          <TouchableOpacity style={styles.sideButton}>
            <Ionicons name="images-outline" size={32} color="white" />
          </TouchableOpacity>

          <Shutter takePicture={takePicture} />

          <TouchableOpacity
            style={styles.sideButton}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Ionicons name="camera-reverse-outline" size={32} color="white" />
          </TouchableOpacity>
        </Animated.View>

        {/* Dial de Zoom */}
        <Animated.View
          style={{
            transform: [{ translateY: dialTranslate }],
            opacity: dialOpacity,
            width: "100%",
          }}
        >
          <ExposureDialFinal value={zoom} onChange={(v) => setZoom(v)} />
        </Animated.View>
      </View>

      <LUTSelector
        selectedLutId={selectedLutId}
        onSelectLut={setSelectedLutId}
        visible={showLutSelector}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  cameraWrapper: {
    position: "absolute",
    top: 120,
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
    borderRadius: 10,
  },
  camera: { flex: 1 },
  shutterContainer: {
    position: "absolute",
    bottom: 64,
    width: "100%",
    alignItems: "center",
  },
  shutterRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 0,
  },
  buttonsContainer: {
    position: "absolute",
    top: 64,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    zIndex: 10,
  },
  sideButton: { padding: 10 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  processingText: { color: "white", marginTop: 10 },
  message: { color: "white", textAlign: "center", marginBottom: 20 },
});
