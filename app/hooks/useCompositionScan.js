import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import {
  analyze, armCompositionScan, cancel, getCompositionCapturePlugin,
  isCompositionScanAvailable,
} from "../../modules/composition-scan";
import { generateCompositionResult } from "../utils/compositionAnalysis";
import { createCompositionScanSession } from "../utils/compositionScanSession";

export default function useCompositionScan({ enabled, configurationKey, preview }) {
  const isFocused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [snapshot, setSnapshot] = useState({ state: "idle", result: null, scanId: null, phase: null });
  const controllerRef = useRef(null);
  const [available] = useState(isCompositionScanAvailable);
  const canScan = available && enabled && isFocused && foreground && preview.width > 0 && preview.height > 0;

  useEffect(() => {
    const controller = createCompositionScanSession({
      model: { arm: armCompositionScan, analyze, cancel },
      generate: generateCompositionResult,
      onChange: setSnapshot,
      onError: (error) => {
        if (__DEV__) console.warn("[CompositionScan]", error.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      },
    });
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = null; };
  }, []);

  const cancelScan = useCallback(() => controllerRef.current?.cancel(), []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (next) => {
      if (next !== "active") cancelScan();
      setForeground(next === "active");
    });
    return () => listener.remove();
  }, [cancelScan]);
  useEffect(() => {
    cancelScan();
  }, [configurationKey, canScan, cancelScan, preview.width, preview.height, preview.mirrored]);

  const start = useCallback(() => {
    if (canScan && AppState.currentState === "active") void controllerRef.current?.start({ ...preview });
  }, [canScan, preview]);
  const onCaptured = useCallback((token, id) => {
    void controllerRef.current?.captured(token, id);
  }, []);
  return {
    ...snapshot, available, canScan, start, cancel: cancelScan, onCaptured,
    captureRotation: preview.rotation,
    capturePlugin: available ? getCompositionCapturePlugin() : undefined,
    busy: snapshot.state === "capturing" || snapshot.state === "analyzing",
  };
}
