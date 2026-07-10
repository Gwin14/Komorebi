import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  getPortraitCaptureCapabilities,
  isPortraitCaptureAvailable,
} from "../../modules/camera-portrait-capture";

export default function usePortraitCapture(device) {
  const nativeAvailable = Platform.OS === "ios" && isPortraitCaptureAvailable();
  const [enabled, setEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState(null);

  const deviceId = device?.id;
  const canCheckCapabilities = nativeAvailable && Boolean(deviceId);
  const available =
    canCheckCapabilities &&
    (capabilities === null || capabilities.supportsPortraitCapture);

  useEffect(() => {
    if (!canCheckCapabilities) {
      setCapabilities(null);
      setEnabled(false);
      return;
    }

    let cancelled = false;

    getPortraitCaptureCapabilities(deviceId)
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });

    return () => {
      cancelled = true;
    };
  }, [canCheckCapabilities, deviceId]);

  useEffect(() => {
    if (!available) {
      setEnabled(false);
    }
  }, [available]);

  const toggleEnabled = useCallback(() => {
    setEnabled((current) => (available ? !current : false));
  }, [available]);

  return useMemo(
    () => ({
      available,
      capabilities,
      enabled,
      setEnabled,
      toggleEnabled,
    }),
    [available, capabilities, enabled, toggleEnabled],
  );
}
