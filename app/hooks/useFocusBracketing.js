import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { setImageStackingFocus } from "../../modules/camera-image-stacking";
import { clampFocusEndpoint, createFocusScheduler, DEFAULT_FOCUS_FRAMES, isFocusRangeValid } from "../utils/focusBracketing";

export default function useFocusBracketing({ deviceId, zoomFactor, enabled, ready, capturing }) {
  const [limits, setLimits] = useState({ near: 0.25, far: 0.75 });
  const limitsRef = useRef(limits);
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  const [confirmedLimits, setConfirmedLimits] = useState({ near: null, far: null });
  const [frameCount, setFrameCount] = useState(DEFAULT_FOCUS_FRAMES);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const schedulerRef = useRef(null);
  const activeRef = useRef(null);

  useLayoutEffect(() => {
    limitsRef.current = { near: 0.25, far: 0.75 };
    activeRef.current = null;
    setLimits(limitsRef.current);
    setActiveEndpoint(null);
    setConfirmedLimits({ near: null, far: null });
  }, [deviceId, zoomFactor]);

  useLayoutEffect(() => {
    if (!enabled || !ready || !deviceId) return;
    setError(null);
    let mounted = true;
    const scheduler = createFocusScheduler(
      (value) => setImageStackingFocus(deviceId, value),
      (value, endpoint, requested) => {
        if (!mounted) return;
        if (endpoint && limitsRef.current[endpoint] === requested) {
          limitsRef.current = { ...limitsRef.current, [endpoint]: value };
          setLimits(limitsRef.current);
          setConfirmedLimits((previous) => ({ ...previous, [endpoint]: value }));
        }
        setError(null);
      },
      (cause) => { if (mounted) setError(cause.message || String(cause)); },
      (value) => { if (mounted) setPending(value); },
    );
    schedulerRef.current = scheduler;
    const endpoint = activeRef.current;
    scheduler.request(endpoint ? limitsRef.current[endpoint] : 0.5, endpoint);
    return () => {
      mounted = false;
      scheduler.invalidate();
      schedulerRef.current = null;
      // Obsolete adjustments finish before restoring autofocus.
      void setImageStackingFocus(deviceId, null).catch(() => {});
    };
  }, [deviceId, zoomFactor, enabled, ready]);

  const adjustEndpoint = useCallback((endpoint, requested) => {
    if (capturing || !enabled || !ready || !schedulerRef.current) return;
    const value = clampFocusEndpoint(endpoint, requested, limitsRef.current.near, limitsRef.current.far);
    activeRef.current = endpoint;
    setActiveEndpoint(endpoint);
    limitsRef.current = { ...limitsRef.current, [endpoint]: value };
    setLimits(limitsRef.current);
    setConfirmedLimits((previous) => ({ ...previous, [endpoint]: null }));
    setError(null);
    schedulerRef.current.request(value, endpoint);
  }, [capturing, enabled, ready]);
  const config = useMemo(() => ({ nearLensPosition: confirmedLimits.near, farLensPosition: confirmedLimits.far, frameCount }),
    [confirmedLimits, frameCount]);
  return {
    limits, activeEndpoint, pending, error, config, setFrameCount, adjustEndpoint,
    valid: ready && !pending && !error && isFocusRangeValid(config),
  };
}
