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
  const [zoom, setZoom] = useState(0);
  const cameraRef = useRef(null);

  const [dial, setDial] = useState(false);
  const dialAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);

  const [maxZoom, setMaxZoom] = useState(1);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  // Estado para processamento do LUT
  const [processingData, setProcessingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para seleção de LUT
  const [selectedLutId, setSelectedLutId] = useState("none");
  const [showLutSelector, setShowLutSelector] = useState(false);

  // Carregar todos os LUTs na inicialização
  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);
      console.log("Todos os LUTs foram carregados!");
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasMediaPermission(status === "granted");
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (cameraRef.current) {
        try {
          const devices = await cameraRef.current.getAvailableCameraDevices();
          const currentDevice = devices.find((d) => d.position === facing);
          if (currentDevice && currentDevice.zoom) {
            setMaxZoom(currentDevice.zoom.max);
          }
        } catch (e) {
          console.log("Erro ao obter zoom da câmera:", e);
        }
      }
    })();
  }, [facing]);

  if (!cameraPermission) return <View />;
  if (!cameraPermission.granted)
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Precisamos da sua permissão para usar a câmera
        </Text>
        <Button onPress={requestCameraPermission} title="Dar permissão" />
      </View>
    );

  function toggleCameraFacing() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  function toggleFlash() {
    setFlash((current) => (current === "off" ? "on" : "off"));
  }

  function toggleLutSelector() {
    setShowLutSelector(!showLutSelector);
  }

  const takePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      try {
        setIsProcessing(true);

        // Tirar a foto
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        });

        console.log("Foto capturada:", photo.uri);

        // Aplicar LUT se um filtro foi selecionado
        if (selectedLutId !== "none" && lutsLoaded) {
          console.log(`Preparando para aplicar LUT: ${selectedLutId}`);
          const processingInfo = await applyLUTToImage(
            photo.uri,
            selectedLutId
          );

          if (processingInfo.needsProcessing) {
            // Iniciar processamento via WebView
            setProcessingData(processingInfo);
          } else {
            // Salvar sem LUT
            if (hasMediaPermission) {
              await MediaLibrary.saveToLibraryAsync(photo.uri);
              console.log("Foto salva na galeria (sem LUT)!");
            }
            setIsProcessing(false);
          }
        } else {
          // Salvar sem LUT
          if (hasMediaPermission) {
            await MediaLibrary.saveToLibraryAsync(photo.uri);
            console.log("Foto salva na galeria!");
          }
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
      console.log("LUT aplicado com sucesso!");

      // Salvar na galeria
      if (hasMediaPermission) {
        await MediaLibrary.saveToLibraryAsync(processedUri);
        console.log("Foto com LUT salva na galeria!");
      }
    } catch (error) {
      console.error("Erro ao salvar foto processada:", error);
    } finally {
      setProcessingData(null);
      setIsProcessing(false);
    }
  };

  const handleProcessingError = (error) => {
    console.error("Erro no processamento:", error);
    // Salvar foto original em caso de erro
    if (processingData && processingData.originalUri && hasMediaPermission) {
      MediaLibrary.saveToLibraryAsync(processingData.originalUri);
      console.log("Foto original salva após erro no processamento");
    }
    setProcessingData(null);
    setIsProcessing(false);
  };

  const toggleDial = () => {
    Animated.timing(dialAnim, {
      toValue: dial ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setDial(!dial);
  };

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
      {/* WebView invisível para processar LUT */}
      {processingData && (
        <LUTProcessor
          imageData={processingData}
          onProcessed={handleProcessed}
          onError={handleProcessingError}
        />
      )}

      {/* Overlay de processamento */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <Text style={styles.processingText}>Processando foto...</Text>
        </View>
      )}

      {/* Barra superior */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.button} onPress={toggleFlash}>
          <Ionicons
            name={flash === "off" ? "flash-off-outline" : "flash-outline"}
            size={32}
            color="white"
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button}>
          <Ionicons name="timer-outline" size={32} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={toggleDial}>
          <Ionicons name="aperture-outline" size={32} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={toggleLutSelector}>
          <Ionicons
            name="color-filter-outline"
            size={32}
            color={selectedLutId !== "none" ? "#ffaa00" : "white"}
          />
        </TouchableOpacity>
      </View>

      {/* Preview da câmera */}
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          facing={facing}
          ref={cameraRef}
          flash={flash}
          zoom={zoom}
        />
      </View>

      {/* Botões inferiores */}
      <View style={styles.shutterContainer}>
        <Animated.View
          style={{
            flexDirection: "row",
            transform: [{ translateY: shutterTranslate }],
            opacity: shutterOpacity,
            width: "100%",
            justifyContent: "space-around",
            position: "absolute",
            bottom: 0,
          }}
        >
          <TouchableOpacity style={styles.button}>
            <Ionicons name="images-outline" size={32} color="white" />
          </TouchableOpacity>

          <Shutter takePicture={takePicture} />

          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Ionicons name="camera-reverse-outline" size={32} color="white" />
          </TouchableOpacity>
        </Animated.View>

        {/* Dial */}
        <Animated.View
          style={{
            transform: [{ translateY: dialTranslate }],
            opacity: dialOpacity,
            width: "100%",
          }}
        >
          <ExposureDialFinal
            value={zoom}
            maxValue={maxZoom}
            onChange={(v) => setZoom(v)}
          />
        </Animated.View>
      </View>

      {/* Seletor de LUT */}
      <LUTSelector
        selectedLutId={selectedLutId}
        onSelectLut={setSelectedLutId}
        visible={showLutSelector}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  cameraWrapper: {
    position: "absolute",
    top: 120,
    width: "100%",
    height: undefined,
    aspectRatio: 3 / 4,
    overflow: "hidden",
    borderRadius: 10,
  },
  camera: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  shutterContainer: {
    position: "absolute",
    bottom: 64,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonsContainer: {
    position: "absolute",
    top: 64,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
  },
  button: { flex: 1, alignItems: "center" },
  message: { textAlign: "center", paddingBottom: 10, color: "white" },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  processingText: {
    color: "white",
    marginTop: 16,
    fontSize: 16,
  },
});
