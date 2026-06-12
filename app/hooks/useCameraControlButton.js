import { useEffect, useRef } from "react";
import {
  addCameraButtonListener,
  startListening,
  stopListening,
} from "../../modules/camera-control-button";

const DEFAULT_TRIGGER_INTERVAL_MS = 700;

// Triggers the shutter when the iPhone hardware Camera Control button is
// pressed. Mirrors the debounce behaviour of useVolumeShutter so both inputs
// feel the same.
export default function useCameraControlButton({
  enabled,
  onPress,
  triggerIntervalMs = DEFAULT_TRIGGER_INTERVAL_MS,
}) {
  const callbackRef = useRef(onPress);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (!enabled) return undefined;

    let subscription;
    try {
      startListening().catch(() => {});
      subscription = addCameraButtonListener(() => {
        const now = Date.now();

        if (now - lastTriggerAtRef.current < triggerIntervalMs) {
          return;
        }

        lastTriggerAtRef.current = now;
        callbackRef.current?.();
      });
    } catch (error) {
      console.warn("Camera Control indisponivel:", error);
    }

    return () => {
      subscription?.remove();
      stopListening().catch(() => {});
    };
  }, [enabled, triggerIntervalMs]);
}
