import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  isRawCaptureAvailable,
  isRawCaptureModeSupported,
} from "../../modules/camera-raw-capture";

import { toggleFileFormat } from "../utils/fileFormatSelection";

export default function useRawCapture(device) {
  const nativeAvailable = Platform.OS === "ios" && isRawCaptureAvailable();
  const [selection, setSelection] = useState({
    rawMode: "off",
    processedEnabled: true,
  });
  const { rawMode, processedEnabled } = selection;
  const setRawMode = useCallback((mode) => {
    setSelection((current) => ({
      rawMode: mode,
      processedEnabled: mode === "off" || current.processedEnabled,
    }));
  }, []);
  const [capabilities, setCapabilities] = useState(null);

  const deviceId = device?.id;
  const isBackCamera = device?.position === "back";
  const nativeModesAllowRaw = Boolean(
    capabilities?.supportedModes?.some((mode) => mode !== "off"),
  );
  const canCheckCapabilities = nativeAvailable && Boolean(deviceId);
  const available = canCheckCapabilities && isBackCamera && nativeModesAllowRaw;

  useEffect(() => {
    setCapabilities(null);
    setRawMode("off");
  }, [deviceId, setRawMode]);

  const updateCapabilities = useCallback(
    (caps) => {
      if (!caps || caps.deviceId !== deviceId) return;
      setCapabilities(caps);
    },
    [deviceId],
  );

  useEffect(() => {
    if (!isRawCaptureModeSupported(rawMode, capabilities)) {
      setRawMode("off");
    }
  }, [capabilities, rawMode, setRawMode]);

  const toggleFormat = useCallback(
    (target) => {
      setSelection((current) =>
        toggleFileFormat(
          current,
          target,
          available ? capabilities.supportedModes : ["off"],
        ),
      );
    },
    [available, capabilities],
  );

  return useMemo(
    () => ({
      available,
      updateCapabilities,
      capabilities,
      rawMode,
      setRawMode,
      rawModeEnabled: rawMode !== "off",
      processedEnabled,
      toggleFormat,
    }),
    [
      available,
      capabilities,
      rawMode,
      processedEnabled,
      toggleFormat,
      updateCapabilities,
      setRawMode,
    ],
  );
}
