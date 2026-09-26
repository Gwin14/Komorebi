import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import {
  cancelImageStackingCapture,
  captureNextImageStackingExposure,
  getImageStackingCapabilities,
  isImageStackingAvailable,
  startImageStackingCapture,
  stopImageStackingCapture,
} from "../../modules/camera-image-stacking";

const IDLE_PROGRESS = {
  state: "idle",
  strategyId: null,
  capturedFrames: 0,
  acceptedFrames: 0,
  rejectedFrames: 0,
  elapsedSeconds: 0,
  progress: 0,
};

export default function useImageStacking(device) {
  const nativeAvailable =
    Platform.OS === "ios" && isImageStackingAvailable();
  const [capabilities, setCapabilities] = useState(null);
  const [strategyId, setStrategyId] = useState(null);
  const [progress, setProgress] = useState(IDLE_PROGRESS);
  const [capturing, setCapturing] = useState(false);
  const deviceId = device?.id;

  useEffect(() => {
    if (!nativeAvailable || !deviceId) {
      setCapabilities(null);
      setStrategyId(null);
      return;
    }
    let cancelled = false;
    getImageStackingCapabilities(deviceId)
      .then((value) => {
        if (!cancelled) setCapabilities(value);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, nativeAvailable]);

  useEffect(
    () => () => {
      void cancelImageStackingCapture();
    },
    [],
  );

  const available = Boolean(
    nativeAvailable &&
      deviceId &&
      (capabilities === null || capabilities.available),
  );

  const selectStrategy = useCallback(
    (nextStrategyId) => {
      if (capturing) return;
      if (!nextStrategyId || nextStrategyId === "off") {
        setStrategyId(null);
        setProgress(IDLE_PROGRESS);
        return;
      }
      if (
        available &&
        (capabilities === null ||
          capabilities.supportedStrategies.includes(nextStrategyId))
      ) {
        setStrategyId(nextStrategyId);
      }
    },
    [available, capabilities, capturing],
  );

  const start = useCallback(
    async ({ outputFormat = "heif", exposureCompensationEV = -1.5,
      previewDoubleExposure = false, previewStacking = false } = {}) => {
      if (!strategyId || !deviceId || capturing) return null;
      setProgress({ ...IDLE_PROGRESS, strategyId, state: "preparing" });
      setCapturing(true);
      try {
        return await startImageStackingCapture({
          deviceId,
          strategyId,
          outputFormat,
          previewDoubleExposure,
          previewStacking,
          ...(["bulb", "motionBlur"].includes(strategyId)
            ? { maximumDurationSeconds: 300 }
            : {}),
          ...(strategyId === "doubleExposure"
            ? { exposureCompensationEV }
            : {}),
        });
      } finally {
        setCapturing(false);
      }
    },
    [capturing, deviceId, strategyId],
  );

  const stop = useCallback(async () => {
    if (capturing && ["bulb", "motionBlur"].includes(strategyId)) {
      await stopImageStackingCapture();
    }
  }, [capturing, strategyId]);

  const advance = useCallback(async () => {
    if (capturing && strategyId === "doubleExposure") {
      await captureNextImageStackingExposure();
    }
  }, [capturing, strategyId]);

  const cancel = useCallback(async () => {
    await cancelImageStackingCapture();
  }, []);

  const handleProgress = useCallback((event) => {
    const value = event?.nativeEvent ?? event;
    if (!value?.state) return;
    setProgress((current) => ({ ...current, ...value }));
  }, []);

  return useMemo(
    () => ({
      available,
      capabilities,
      strategyId,
      enabled: Boolean(strategyId),
      capturing,
      progress,
      selectStrategy,
      start,
      stop,
      advance,
      cancel,
      handleProgress,
    }),
    [
      available,
      capabilities,
      cancel,
      capturing,
      handleProgress,
      progress,
      selectStrategy,
      start,
      advance,
      stop,
      strategyId,
    ],
  );
}
