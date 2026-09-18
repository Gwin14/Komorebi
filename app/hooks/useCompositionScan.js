import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import {
  addCompositionTrackingListener, analyze, armCompositionScan, cancel, getCompositionCapturePlugin,
  isCompositionScanAvailable, isCompositionScanSupported,
} from "../../modules/composition-scan";
import { createCompositionAdvisor } from "../utils/compositionAnalysis";
import {
  applyCompositionTracking,
  advanceAlignmentGate,
  calculateFramingZoom,
  getFramingAlignment,
} from "../utils/compositionCoordinates";
import { createCompositionScanSession } from "../utils/compositionScanSession";

export default function useCompositionScan({
  enabled,
  configurationKey,
  preview,
  zoom,
  minZoom,
  maxZoom,
  onAutoZoom,
  onCancelAutoZoom,
}) {
  const isFocused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [snapshot, setSnapshot] = useState({ state: "idle", result: null, scanId: null, trackingScanId: null, phase: null });
  const [tracking, setTracking] = useState(null);
  const controllerRef = useRef(null);
  const advisorRef = useRef(null);
  const analysisGeometryRef = useRef(null);
  const trackingIdRef = useRef(null);
  const alignedUpdatesRef = useRef(0);
  const lastCountedTrackingRef = useRef(null);
  const zoomTriggeredRef = useRef(false);
  const zoomRef = useRef(zoom);
  const zoomLimitsRef = useRef({ minZoom, maxZoom });
  const onAutoZoomRef = useRef(onAutoZoom);
  const onCancelAutoZoomRef = useRef(onCancelAutoZoom);
  const [available, setAvailable] = useState(isCompositionScanAvailable);
  const supported = isCompositionScanSupported();
  const canScan = available && enabled && isFocused && foreground && preview.width > 0 && preview.height > 0;
  const log = useCallback((event, details = {}) => {
    console.log(`[CompositionScan] JS ${event}`, details);
  }, []);

  zoomRef.current = zoom;
  zoomLimitsRef.current = { minZoom, maxZoom };
  onAutoZoomRef.current = onAutoZoom;
  onCancelAutoZoomRef.current = onCancelAutoZoom;

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
      getAnalysisContext: () => ({
        ...advisor.context(),
        frameAspectRatio: preview.width > 0 && preview.height > 0
          ? preview.width / preview.height
          : 0.75,
      }),
      generate: (analysis, scanPreview) => {
        analysisGeometryRef.current = analysis.geometry;
        return advisor.generate(analysis, scanPreview);
      },
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
  }, [log, preview.height, preview.width]);

  useEffect(() => {
    const subscription = addCompositionTrackingListener((update) => {
      if (!update || update.scanId !== trackingIdRef.current) return;
      setTracking(update);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    trackingIdRef.current = snapshot.trackingScanId;
    alignedUpdatesRef.current = 0;
    lastCountedTrackingRef.current = null;
    zoomTriggeredRef.current = false;
    // Wait for real 10 Hz native updates so the three-sample stability gate
    // is never advanced by a React render or a synthetic identity matrix.
    setTracking(null);
  }, [snapshot.trackingScanId]);

  const cancelScan = useCallback(() => controllerRef.current?.cancel(), []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (next) => {
      if (next !== "active") cancelScan();
      setForeground(next === "active");
    });
    return () => listener.remove();
  }, [cancelScan]);
  useEffect(() => {
    onCancelAutoZoomRef.current?.();
    cancelScan();
    advisorRef.current?.reset();
    analysisGeometryRef.current = null;
    setTracking(null);
  }, [configurationKey, canScan, cancelScan, preview.width, preview.height, preview.mirrored]);

  const start = useCallback(() => {
    log("button-start", { canScan, appState: AppState.currentState, preview });
    if (canScan && AppState.currentState === "active") {
      onCancelAutoZoomRef.current?.();
      void controllerRef.current?.start({ ...preview });
    }
  }, [canScan, log, preview]);
  const onCaptured = useCallback((token, id) => {
    void controllerRef.current?.captured(token, id);
  }, []);
  const trackedResult = useMemo(() => {
    return applyCompositionTracking(snapshot.result, analysisGeometryRef.current, preview, tracking);
  }, [preview, snapshot.result, tracking]);

  useEffect(() => {
    if (!tracking?.lost) return;
    cancelScan();
  }, [cancelScan, tracking?.lost]);

  useEffect(() => {
    if (!trackedResult || !tracking || tracking.lost || zoomTriggeredRef.current ||
        snapshot.state !== "showing-results") {
      alignedUpdatesRef.current = 0;
      return;
    }
    if (lastCountedTrackingRef.current === tracking) return;
    lastCountedTrackingRef.current = tracking;
    const alignment = getFramingAlignment(trackedResult, preview);
    const gate = advanceAlignmentGate(alignedUpdatesRef.current, Boolean(alignment?.aligned));
    alignedUpdatesRef.current = gate.count;
    if (!gate.triggered) return;

    zoomTriggeredRef.current = true;
    const { minZoom: minimum, maxZoom: maximum } = zoomLimitsRef.current;
    const targetZoom = calculateFramingZoom(
      alignment.framing.rect,
      zoomRef.current,
      minimum,
      maximum,
    );
    log("auto-zoom", { targetZoom, distance: alignment.distance, tolerance: alignment.tolerance });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const zoomScanId = snapshot.trackingScanId;
    void Promise.resolve(onAutoZoomRef.current?.(targetZoom, 250)).then((completed) => {
      if (completed !== false && trackingIdRef.current === zoomScanId) {
        controllerRef.current?.completeZoom();
      }
    });
  }, [log, preview, snapshot.state, snapshot.trackingScanId, trackedResult, tracking]);

  return {
    ...snapshot, result: trackedResult, supported, available, canScan, start, cancel: cancelScan, onCaptured,
    captureScanId: snapshot.scanId,
    captureRotation: preview.rotation,
    capturePlugin: available ? getCompositionCapturePlugin() : undefined,
    busy: snapshot.state === "capturing" || snapshot.state === "analyzing",
  };
}
