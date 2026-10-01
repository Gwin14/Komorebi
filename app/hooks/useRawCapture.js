import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  getNextRawCaptureMode,
  isRawCaptureAvailable,
  isRawCaptureModeSupported,
} from "../../modules/camera-raw-capture";

export default function useRawCapture(device) {
  const nativeAvailable = Platform.OS === "ios" && isRawCaptureAvailable();
  const [rawMode, setRawMode] = useState("off");
  const [capabilities, setCapabilities] = useState(null);

  const deviceId = device?.id;
  const isBackCamera = device?.position === "back";
  const nativeModesAllowRaw = Boolean(
    capabilities?.supportedModes?.some((mode) => mode !== "off"),
  );
  const canCheckCapabilities = nativeAvailable && Boolean(deviceId);
  const available =
    canCheckCapabilities &&
    isBackCamera &&
    nativeModesAllowRaw;

  useEffect(() => {
    setCapabilities(null);
    setRawMode("off");
  }, [deviceId]);

  const updateCapabilities = useCallback((caps) => {
    if (!caps || caps.deviceId !== deviceId) return;
    setCapabilities(caps);
  }, [deviceId]);

  useEffect(() => {
    if (!isRawCaptureModeSupported(rawMode, capabilities)) {
      setRawMode("off");
    }
  }, [capabilities, rawMode]);

  const toggleRawMode = useCallback(() => {
    if (!available) {
      setRawMode("off");
      return;
    }

    setRawMode((current) => getNextRawCaptureMode(current, capabilities));
  }, [available, capabilities]);

  return useMemo(
    () => ({
      available,
      updateCapabilities,
      capabilities,
      rawMode,
      setRawMode,
      rawModeEnabled: rawMode !== "off",
      toggleRawMode,
    }),
    [available, capabilities, rawMode, toggleRawMode, updateCapabilities],
  );
}
