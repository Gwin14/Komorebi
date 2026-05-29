import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import { Camera } from "react-native-vision-camera";
import { loadAllLUTs, loadCustomLUTs } from "../utils/lutProcessor";

export default function useCameraBootstrap({ customLuts, firstTime }) {
  const [cameraPermission, setCameraPermission] = useState(null);
  const [hasMediaPermission, setHasMediaPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  useEffect(() => {
    if (firstTime) return;

    let isMounted = true;

    const prepareCamera = async () => {
      try {
        await loadAllLUTs();
        await loadCustomLUTs(customLuts);
        if (!isMounted) return;

        setLutsLoaded(true);

        const permission = await Camera.requestCameraPermission();
        if (!isMounted) return;
        setCameraPermission(permission);

        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (!isMounted) return;
        setHasMediaPermission(status === "granted");

        await Location.requestForegroundPermissionsAsync();
      } catch (error) {
        console.error("Erro ao preparar câmera:", error);
      }
    };

    prepareCamera();

    return () => {
      isMounted = false;
    };
  }, [customLuts, firstTime]);

  return {
    cameraPermission,
    hasMediaPermission,
    lutsLoaded,
  };
}
