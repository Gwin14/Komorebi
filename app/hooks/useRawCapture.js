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
  const visionCameraAllowsRaw = Boolean(device?.supportsRawCapture);
  const available = nativeAvailable && visionCameraAllowsRaw;

  useEffect(() => {
    if (!available || !deviceId) {
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
  }, [available, deviceId]);

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
