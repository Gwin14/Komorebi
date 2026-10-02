import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { setImageStackingFocus } from "../../modules/camera-image-stacking";
import { createFocusScheduler, DEFAULT_FOCUS_FRAMES, isFocusRangeValid } from "../utils/focusBracketing";

export default function useFocusBracketing({ deviceId, zoomFactor, enabled, ready, capturing }) {
  const [position, setPosition] = useState(0.5);
  const [confirmed, setConfirmed] = useState(null);
  const [nearLensPosition, setNear] = useState(null);
  const [farLensPosition, setFar] = useState(null);
  const [frameCount, setFrameCount] = useState(DEFAULT_FOCUS_FRAMES);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const schedulerRef = useRef(null);

  useLayoutEffect(() => {
    setNear(null);
    setFar(null);
    setConfirmed(null);
    setPosition(0.5);
  }, [deviceId, zoomFactor]);

  useLayoutEffect(() => {
    if (!enabled || !ready || !deviceId) return;
    setConfirmed(null);
    setError(null);
    let mounted = true;
    const scheduler = createFocusScheduler(
      (value) => setImageStackingFocus(deviceId, value),
      (value) => { if (mounted) { setConfirmed(value); setPosition(value); setError(null); } },
      (cause) => { if (mounted) { setConfirmed(null); setError(cause.message || String(cause)); } },
      (value) => { if (mounted) setPending(value); },
    );
    schedulerRef.current = scheduler;
    scheduler.request(0.5);
    return () => {
      mounted = false;
      scheduler.invalidate();
      schedulerRef.current = null;
      // The native coordinator restores focus after captures. Leaving this
      // mode restores autofocus; obsolete adjustments finish before this call.
      void setImageStackingFocus(deviceId, null).catch(() => {});
    };
  }, [deviceId, zoomFactor, enabled, ready]);

  const adjust = useCallback((value) => {
    if (capturing || !enabled || !ready || !schedulerRef.current) return;
    setPosition(value);
    setError(null);
    schedulerRef.current.request(value);
  }, [capturing, enabled, ready]);
  const config = useMemo(() => ({ nearLensPosition, farLensPosition, frameCount }),
    [nearLensPosition, farLensPosition, frameCount]);
  return {
    position, confirmed, pending, error, config, setFrameCount, adjust,
    canMark: ready && !capturing && !pending && confirmed !== null,
    valid: ready && !pending && confirmed !== null && !error && isFocusRangeValid(config),
    markNear: () => { if (!pending && confirmed !== null) setNear(confirmed); },
    markFar: () => { if (!pending && confirmed !== null) setFar(confirmed); },
  };
}
