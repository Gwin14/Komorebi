import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { Camera } from "react-native-vision-camera";
import { loadAllLUTs, loadCustomLUTs } from "../utils/lutProcessor";

const MEDIA_PERMISSION_TYPES = ["photo", "video"];

export default function useCameraBootstrap({ customLuts }) {
  const [cameraPermission, setCameraPermission] = useState(null);
  const [mediaPermission, setMediaPermission] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [lutsLoaded, setLutsLoaded] = useState(false);

  const refreshPermissions = useCallback(async () => {
    try {
      const [cameraStatus, mediaResult, locationResult] = await Promise.all([
        Camera.getCameraPermissionStatus(),
        MediaLibrary.getPermissionsAsync(false, MEDIA_PERMISSION_TYPES),
        Location.getForegroundPermissionsAsync(),
      ]);

      setCameraPermission(cameraStatus);
      setMediaPermission(mediaResult);
      setLocationPermission(locationResult);
    } catch (error) {
      console.error("Erro ao consultar permissões:", error);
    }
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
  }, [customLuts]);

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
