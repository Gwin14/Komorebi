import { useEffect, useRef } from "react";
import { VolumeManager } from "react-native-volume-manager";

const DEFAULT_TRIGGER_INTERVAL_MS = 700;

export default function useVolumeShutter({
  enabled,
  onVolumeChange,
  triggerIntervalMs = DEFAULT_TRIGGER_INTERVAL_MS,
}) {
  const callbackRef = useRef(onVolumeChange);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = onVolumeChange;
  }, [onVolumeChange]);

  useEffect(() => {
    if (!enabled) return undefined;

    let subscription;
    try {
      VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});

      subscription = VolumeManager.addVolumeListener(() => {
        const now = Date.now();

        if (now - lastTriggerAtRef.current < triggerIntervalMs) {
          return;
        }

        lastTriggerAtRef.current = now;
        callbackRef.current?.();
      });
    } catch (error) {
      console.warn("Volume listener indisponivel:", error);
    }

    return () => {
      subscription?.remove();

      try {
        VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {});
      } catch (_error) {
        // The native module may be unavailable in Expo Go.
      }
    };
  }, [enabled, triggerIntervalMs]);
}
