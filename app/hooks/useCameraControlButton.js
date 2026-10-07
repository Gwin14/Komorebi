import { useEffect, useLayoutEffect, useRef } from "react";
import {
  addCameraButtonListener,
  startListening,
  stopListening,
} from "../../modules/camera-control-button";

// Both platforms emit one event on release; repeats are handled natively.
export default function useCameraControlButton({ enabled, onPress }) {
  const latest = useRef({ enabled, onPress });
  useLayoutEffect(() => {
    latest.current = { enabled, onPress };
  }, [enabled, onPress]);

  useEffect(() => {
    if (!enabled) return undefined;
    let subscription;
    try {
      subscription = addCameraButtonListener((event) => {
        if (latest.current.enabled) latest.current.onPress?.(event);
      });
      if (subscription) {
        startListening().catch((error) => console.warn("Controles físicos indisponíveis:", error));
      }
    } catch (error) {
      console.warn("Controles físicos indisponíveis:", error);
    }
    return () => {
      subscription?.remove();
      stopListening().catch(() => {});
    };
  }, [enabled]);
}
