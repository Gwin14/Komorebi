import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { createCaptureCountdown, normalizeCaptureTimer } from "../utils/captureTimer";

export default function useCaptureTimer({
  seconds,
  enabled,
  configurationKey,
  onCapture,
  onStart,
}) {
  const [remaining, setRemaining] = useState(0);
  const countdown = useRef(null);
  const inFlight = useRef(false);
  const latest = useRef({ enabled, onCapture, onStart });
  const cancel = useCallback(() => {
    countdown.current?.cancel();
    countdown.current = null;
  }, []);

  useLayoutEffect(() => {
    latest.current = { enabled, onCapture, onStart };
  }, [enabled, onCapture, onStart]);

  // Cancel on navigation, camera replacement, timer changes, and unmount.
  useLayoutEffect(() => {
    return cancel;
  }, [enabled, configurationKey, seconds, cancel]);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => listener.remove();
  }, [cancel]);

  const requestCapture = useCallback(async ({ immediate = false, seconds: overrideSeconds } = {}) => {
    if (!latest.current.enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      latest.current.onStart?.();
      const duration = normalizeCaptureTimer(overrideSeconds ?? seconds);
      if (duration && !immediate) {
        const pending = createCaptureCountdown(duration, setRemaining);
        countdown.current = pending;
        const completed = await pending.finished;
        if (countdown.current === pending) countdown.current = null;
        if (!completed) return;
      }
      if (latest.current.enabled && AppState.currentState === "active") {
        // Capture owns its own lock. Release the timer lock immediately so
        // a second press can finish Bulb/Motion Blur while start is pending.
        return latest.current.onCapture();
      }
    } finally {
      inFlight.current = false;
    }
  }, [seconds]);

  return { remaining, cancel, requestCapture };
}
