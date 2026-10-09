import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { Camera } from "react-native-vision-camera";
import { loadAllLUTs, loadCustomLUTs } from "../utils/lutProcessor";

const MEDIA_PERMISSION_TYPES = ["photo", "video"];

export default function useCameraBootstrap({ customLuts, loadLuts = true }) {
  const [cameraPermission, setCameraPermission] = useState(null);
  const [mediaPermission, setMediaPermission] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  const refreshPermissions = useCallback(async () => {
    // Each permission settles independently: a slow or failed library/GPS
    // query must not prevent the camera from mounting.
    const refresh = async (name, read, update) => {
      try {
        update(await read());
      } catch (error) {
        console.error(`Erro ao consultar permissão de ${name}:`, error);
      }
    };
    await Promise.all([
      refresh(
        "câmera",
        () => Camera.getCameraPermissionStatus(),
        setCameraPermission,
      ),
      refresh(
        "fotos",
        () => MediaLibrary.getPermissionsAsync(false, MEDIA_PERMISSION_TYPES),
        setMediaPermission,
      ),
      refresh(
        "localização",
        () => Location.getForegroundPermissionsAsync(),
        setLocationPermission,
      ),
    ]);
  }, []);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error("Erro ao abrir os ajustes do dispositivo:", error);
    }
  }, []);

  const requestCameraPermission = useCallback(async () => {
    const currentStatus = await Camera.getCameraPermissionStatus();
    if (currentStatus === "granted") {
      setCameraPermission(currentStatus);
      return currentStatus;
    }
    if (currentStatus !== "not-determined") {
      await openSettings();
      return currentStatus;
    }

    const nextStatus = await Camera.requestCameraPermission();
    setCameraPermission(nextStatus);
    return nextStatus;
  }, [openSettings]);

  const requestMediaPermission = useCallback(async () => {
    const current = await MediaLibrary.getPermissionsAsync(
      false,
      MEDIA_PERMISSION_TYPES,
    );
    setMediaPermission(current);
    if (current.granted) return current;
    if (current.status !== "undetermined" || !current.canAskAgain) {
      await openSettings();
      return current;
    }

    const next = await MediaLibrary.requestPermissionsAsync(
      false,
      MEDIA_PERMISSION_TYPES,
    );
    setMediaPermission(next);
    return next;
  }, [openSettings]);

  const requestLocationPermission = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync();
    setLocationPermission(current);
    if (current.granted) return current;
    if (current.status !== "undetermined" || !current.canAskAgain) {
      await openSettings();
      return current;
    }

    const next = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(next);
    return next;
  }, [openSettings]);

  useEffect(() => {
    void refreshPermissions();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshPermissions();
    });

    return () => subscription.remove();
  }, [refreshPermissions]);

  useEffect(() => {
    if (!loadLuts) return;
    let isMounted = true;

    const prepareLuts = async () => {
      try {
        await loadAllLUTs();
        await loadCustomLUTs(customLuts);
        if (isMounted) setLutsLoaded(true);
      } catch (error) {
        console.error("Erro ao carregar LUTs:", error);
      }
    };

    void prepareLuts();

    return () => {
      isMounted = false;
    };
  }, [customLuts, loadLuts]);

  return {
    cameraPermission,
    hasMediaPermission:
      mediaPermission === null ? null : mediaPermission.status === "granted",
    mediaPermission,
    locationPermission,
    lutsLoaded,
    refreshPermissions,
    requestCameraPermission,
    requestMediaPermission,
    requestLocationPermission,
  };
}
