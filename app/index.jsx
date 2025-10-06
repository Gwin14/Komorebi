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
import Shutter from "./components/shutter";

export default function App() {
  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [zoom, setZoom] = useState(0); // valor entre 0 e 1
  const cameraRef = useRef(null);

  const [dial, setDial] = useState(false);
  const dialAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaPermission, setHasMediaPermission] = useState(null);

  const [maxZoom, setMaxZoom] = useState(1); // zoom máximo do dispositivo

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
            setMaxZoom(currentDevice.zoom.max); // pega limite máximo
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

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      if (hasMediaPermission) {
        await MediaLibrary.saveToLibraryAsync(photo.uri);
      }
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
        <TouchableOpacity style={styles.button}>
          <Ionicons name="settings-outline" size={32} color="white" />
        </TouchableOpacity>
      </View>

      {/* Preview da câmera */}
      <CameraView
        style={styles.camera}
        facing={facing}
        ref={cameraRef}
        flash={flash}
        zoom={zoom}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  camera: {
    aspectRatio: 3 / 4,
    borderRadius: 10,
    overflow: "hidden",
    transform: [{ translateY: -40 }],
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
});
