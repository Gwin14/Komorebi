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
        // Permissões em paralelo — não dependem dos LUTs
        const [permission, mediaResult] = await Promise.all([
          Camera.requestCameraPermission(),
          MediaLibrary.requestPermissionsAsync(),
          Location.requestForegroundPermissionsAsync(),
        ]);

        if (!isMounted) return;
        setCameraPermission(permission);
        setHasMediaPermission(mediaResult.status === "granted");

        // LUTs em background — câmera já pode montar
        loadAllLUTs()
          .then(() => loadCustomLUTs(customLuts))
          .then(() => {
            if (isMounted) setLutsLoaded(true);
          })
          .catch(console.error);
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
