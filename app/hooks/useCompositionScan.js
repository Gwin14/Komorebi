import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import {
  analyze, armCompositionScan, cancel, getCompositionCapturePlugin,
  isCompositionScanAvailable, isCompositionScanSupported,
} from "../../modules/composition-scan";
import { createCompositionAdvisor } from "../utils/compositionAnalysis";
import { createCompositionScanSession } from "../utils/compositionScanSession";

export default function useCompositionScan({ enabled, configurationKey, preview }) {
  const isFocused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [snapshot, setSnapshot] = useState({ state: "idle", result: null, scanId: null, phase: null });
  const controllerRef = useRef(null);
  const advisorRef = useRef(null);
  const [available, setAvailable] = useState(isCompositionScanAvailable);
  const supported = isCompositionScanSupported();
  const canScan = available && enabled && isFocused && foreground && preview.width > 0 && preview.height > 0;
  const log = useCallback((event, details = {}) => {
    console.log(`[CompositionScan] JS ${event}`, details);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const nextAvailable = isCompositionScanAvailable();
    log("availability", { supported, available: nextAvailable, enabled, configurationKey });
    setAvailable(nextAvailable);
  }, [configurationKey, enabled, log, supported]);

  useEffect(() => {
    const advisor = createCompositionAdvisor();
    advisorRef.current = advisor;
    const controller = createCompositionScanSession({
      model: { arm: armCompositionScan, analyze, cancel },
      generate: (analysis, scanPreview) => advisor.generate(analysis, scanPreview),
      onChange: setSnapshot,
      onError: (error) => {
        if (__DEV__) console.warn("[CompositionScan]", error.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      },
      log,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
      advisorRef.current = null;
    };
  }, [log]);

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
    advisorRef.current?.reset();
  }, [configurationKey, canScan, cancelScan, preview.width, preview.height, preview.mirrored]);

  const start = useCallback(() => {
    log("button-start", { canScan, appState: AppState.currentState, preview });
    if (canScan && AppState.currentState === "active") void controllerRef.current?.start({ ...preview });
  }, [canScan, log, preview]);
  const onCaptured = useCallback((token, id) => {
    void controllerRef.current?.captured(token, id);
  }, []);
  return {
    ...snapshot, supported, available, canScan, start, cancel: cancelScan, onCaptured,
    captureRotation: preview.rotation,
    capturePlugin: available ? getCompositionCapturePlugin() : undefined,
    busy: snapshot.state === "capturing" || snapshot.state === "analyzing",
  };
}
