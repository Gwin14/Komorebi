import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  getNextRawCaptureMode,
  getRawCaptureCapabilities,
  isRawCaptureAvailable,
  isRawCaptureModeSupported,
} from "../../modules/camera-raw-capture";

export default function useRawCapture(device) {
  const nativeAvailable = Platform.OS === "ios" && isRawCaptureAvailable();
  const [rawMode, setRawMode] = useState("off");
  const [capabilities, setCapabilities] = useState(null);

  const deviceId = device?.id;
  const isBackCamera = device?.position === "back";
  const visionCameraAllowsRaw = Boolean(device?.supportsRawCapture);
  const nativeModesAllowRaw = Boolean(
    capabilities?.supportedModes?.some((mode) => mode !== "off"),
  );
  const canCheckCapabilities = nativeAvailable && Boolean(deviceId);
  const available =
    canCheckCapabilities &&
    isBackCamera &&
    (capabilities === null || visionCameraAllowsRaw || nativeModesAllowRaw);

  useEffect(() => {
    if (!canCheckCapabilities || !isBackCamera) {
      setCapabilities(null);
      setRawMode("off");
      return;
    }

    let cancelled = false;

    getRawCaptureCapabilities(deviceId)
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });

    return () => {
      cancelled = true;
    };
  }, [canCheckCapabilities, deviceId, isBackCamera]);

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
      capabilities,
      rawMode,
      rawModeEnabled: rawMode !== "off",
      toggleRawMode,
    }),
    [available, capabilities, rawMode, toggleRawMode],
  );
}
