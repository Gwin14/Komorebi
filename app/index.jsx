import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0);
  const cameraRef = useRef(null);

  // --- MUDANÇA 1: Estado Unificado de Controle ---
  // 'none' = Shutter visível
  // 'zoom' = Dial de Zoom visível
  // 'lut'  = Seletor de LUT visível
  const [activeControl, setActiveControl] = useState("none");

  // Animação controla a transição entre (Shutter) e (Ferramentas)
  const controlsAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  // Estados de Processamento
  const [processingData, setProcessingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState("none");

  useEffect(() => {
    (async () => {
      await loadAllLUTs();
      setLutsLoaded(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasMediaPermission(status === "granted");
    })();
  }, []);

  // --- MUDANÇA 2: Efeito para disparar a animação ---
  useEffect(() => {
    const showTools = activeControl !== "none";

    Animated.timing(controlsAnim, {
      toValue: showTools ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [activeControl]);

  // Função helper para alternar modos
  const toggleMode = (mode) => {
    setActiveControl((current) => (current === mode ? "none" : mode));
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

  // Interpolações de Animação (baseadas no controlsAnim)
  const shutterTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100], // Desce o shutter
  });

  const toolsTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0], // Sobe as ferramentas
  });

  const toolsOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const shutterOpacity = controlsAnim.interpolate({
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

        {/* Botão Zoom */}
        <TouchableOpacity onPress={() => toggleMode("zoom")}>
          <Ionicons
            name="aperture-outline"
            size={32}
            color={activeControl === "zoom" ? "#ffaa00" : "white"}
          />
        </TouchableOpacity>

        {/* Botão LUTs */}
        <TouchableOpacity onPress={() => toggleMode("lut")}>
          <Ionicons
            name="color-filter-outline"
            size={32}
            color={
              activeControl === "lut"
                ? "#ffaa00"
                : selectedLutId !== "none"
                ? "#ffaa00"
                : "white"
            }
          />
        </TouchableOpacity>

        <TouchableOpacity>
          <Ionicons
            name="settings-outline"
            size={32}
            color="white"
            onPress={() => router.push("components/Settings")}
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
        {/* GRUPO 1: SHUTTER E BOTÕES LATERAIS (Desaparecem) */}
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

          {/* O Shutter só é clicável se os controles estiverem fechados para evitar toques acidentais durante a animação */}
          <View pointerEvents={activeControl === "none" ? "auto" : "none"}>
            <Shutter takePicture={takePicture} />
          </View>

          <TouchableOpacity
            style={styles.sideButton}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Ionicons name="camera-reverse-outline" size={32} color="white" />
          </TouchableOpacity>
        </Animated.View>

        {/* GRUPO 2: FERRAMENTAS (DIAL ou LUT) (Aparecem) */}
        <Animated.View
          style={{
            transform: [{ translateY: toolsTranslate }],
            opacity: toolsOpacity,
            width: "100%",
            position: "absolute",
            bottom: 0,
            height: 100, // Altura fixa para garantir alinhamento
            justifyContent: "center",
            zIndex: 10,
          }}
          // Importante: Impede toques nas ferramentas quando elas estão invisíveis
          pointerEvents={activeControl !== "none" ? "auto" : "none"}
        >
          {activeControl === "zoom" && (
            <ExposureDialFinal value={zoom} onChange={(v) => setZoom(v)} />
          )}

          {activeControl === "lut" && (
            // Assumindo que seu LUTSelector pode ser renderizado inline.
            // Passamos visible={true} pois a animação do pai cuida de esconder/mostrar
            <View
              style={{
                flex: 1,
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LUTSelector
                selectedLutId={selectedLutId}
                onSelectLut={setSelectedLutId}
                visible={true}
              />
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  cameraWrapper: {
    position: "absolute",

    // estilos originais
    top: 120,
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
    borderRadius: 10,

    // estilos retrô
    // alignSelf: "center",
    // top: 130,
    // width: "95%",
  },
  camera: { flex: 1 },
  shutterContainer: {
    position: "absolute",
    bottom: 64,
    width: "100%",
    alignItems: "center",
    height: 100, // Definir uma altura para o container ajuda na animação de troca
  },
  shutterRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 0,
    height: "100%",
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
