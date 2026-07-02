import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  getCameraCapabilities,
  isManualControlsAvailable,
  setAutoExposure,
  setAutoFocus,
  focusAtPoint as focusAtPointNative,
  setAutoWhiteBalance,
  setManualExposure,
  setManualFocus,
  setManualWhiteBalance,
} from "../../modules/camera-manual-controls";

const DEFAULT_ISO = 100;
const DEFAULT_SHUTTER_SECONDS = 1 / 125;
const DEFAULT_WB_KELVIN = 5500;
const DEFAULT_WB_TINT = 0;
const DEFAULT_FOCUS = 0.5;

// Manual ISO/shutter/white balance/focus, backed by the CameraManualControls
// native module. iOS only — see modules/camera-manual-controls for why.
export default function useManualCameraControls(device) {
  const available = Platform.OS === "ios" && isManualControlsAvailable();

  const [manualMode, setManualMode] = useState("auto");
  const [capabilities, setCapabilities] = useState(null);
  const [manualISO, setManualISO] = useState(DEFAULT_ISO);
  const [manualShutterSeconds, setManualShutterSeconds] = useState(
    DEFAULT_SHUTTER_SECONDS,
  );
  const [manualWBKelvin, setManualWBKelvin] = useState(DEFAULT_WB_KELVIN);
  const [manualWBTint, setManualWBTint] = useState(DEFAULT_WB_TINT);
  const [manualFocus, setManualFocusValue] = useState(DEFAULT_FOCUS);

  // O AVCaptureDevice aplica ISO e obturador como um par, mas a UI mantém
  // o estado AUTO de cada slider separado para que resetar um não resete o
  // outro visualmente. Só voltamos o device para auto nativo quando ambos
  // estiverem em AUTO.
  // WB e foco têm cada um seu próprio modo automático nativo. EV não tem
  // estado de auto: é sempre manual, com padrão fixo 0 (ver ExposureSlider
  // usado direto em app/index.jsx fora deste hook).
  const [isoAuto, setIsoAuto] = useState(true);
  const [shutterAuto, setShutterAuto] = useState(true);
  const [wbAuto, setWbAuto] = useState(true);
  const [focusAuto, setFocusAuto] = useState(true);

  const deviceId = device?.id;
  const manualModeRef = useRef(manualMode);
  manualModeRef.current = manualMode;
  const isoAutoRef = useRef(isoAuto);
  isoAutoRef.current = isoAuto;
  const shutterAutoRef = useRef(shutterAuto);
  shutterAutoRef.current = shutterAuto;
  const wbAutoRef = useRef(wbAuto);
  wbAutoRef.current = wbAuto;
  const focusAutoRef = useRef(focusAuto);
  focusAutoRef.current = focusAuto;

  useEffect(() => {
    if (!available || !deviceId) {
      setCapabilities(null);
      return;
    }

    let cancelled = false;

    getCameraCapabilities(deviceId).then((caps) => {
      if (!cancelled) setCapabilities(caps);
    });

    return () => {
      cancelled = true;
    };
  }, [available, deviceId]);

  const applyExposure = useCallback(
    (iso, shutterSeconds) => {
      if (!available || !deviceId) return;
      setManualExposure(deviceId, iso, shutterSeconds).catch(() => {});
    },
    [available, deviceId],
  );

  const applyWhiteBalance = useCallback(
    (kelvin, tint) => {
      if (!available || !deviceId) return;
      setManualWhiteBalance(deviceId, kelvin, tint).catch(() => {});
    },
    [available, deviceId],
  );

  const applyFocus = useCallback(
    (lensPosition) => {
      if (!available || !deviceId) return;
      setManualFocus(deviceId, lensPosition).catch(() => {});
    },
    [available, deviceId],
  );

  const focusAtPoint = useCallback(
    async (pointX, pointY) => {
      if (!available || !deviceId) return false;

      try {
        await focusAtPointNative(deviceId, pointX, pointY);
        return true;
      } catch {
        return false;
      }
    },
    [available, deviceId],
  );

  // Re-apply manual values whenever the active device changes (lens/facing
  // swap), since vision-camera reconfiguring its session can reset the
  // device back to automatic mode.
  useEffect(() => {
    if (!available || !deviceId || manualModeRef.current !== "manual") return;

    if (isoAutoRef.current && shutterAutoRef.current) {
      setAutoExposure(deviceId).catch(() => {});
    } else {
      applyExposure(manualISO, manualShutterSeconds);
    }
    if (wbAutoRef.current) {
      setAutoWhiteBalance(deviceId).catch(() => {});
    } else {
      applyWhiteBalance(manualWBKelvin, manualWBTint);
    }
    if (focusAutoRef.current) {
      setAutoFocus(deviceId).catch(() => {});
    } else {
      applyFocus(manualFocus);
    }
    // Only re-trigger on device change, not on every value change (those are
    // applied individually by the setters below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, deviceId]);

  const setISO = useCallback(
    (iso) => {
      setManualISO(iso);
      setIsoAuto(false);
      if (manualModeRef.current === "manual") {
        applyExposure(iso, manualShutterSeconds);
      }
    },
    [applyExposure, manualShutterSeconds],
  );

  const setShutterSeconds = useCallback(
    (seconds) => {
      setManualShutterSeconds(seconds);
      setShutterAuto(false);
      if (manualModeRef.current === "manual") {
        applyExposure(manualISO, seconds);
      }
    },
    [applyExposure, manualISO],
  );

  const resetISOToAuto = useCallback(() => {
    setManualISO(DEFAULT_ISO);
    setIsoAuto(true);
    if (manualModeRef.current === "manual" && available && deviceId) {
      if (shutterAutoRef.current) {
        setAutoExposure(deviceId).catch(() => {});
      } else {
        applyExposure(DEFAULT_ISO, manualShutterSeconds);
      }
    }
  }, [applyExposure, available, deviceId, manualShutterSeconds]);

  const resetShutterToAuto = useCallback(() => {
    setManualShutterSeconds(DEFAULT_SHUTTER_SECONDS);
    setShutterAuto(true);
    if (manualModeRef.current === "manual" && available && deviceId) {
      if (isoAutoRef.current) {
        setAutoExposure(deviceId).catch(() => {});
      } else {
        applyExposure(manualISO, DEFAULT_SHUTTER_SECONDS);
      }
    }
  }, [applyExposure, available, deviceId, manualISO]);

  const setWBKelvin = useCallback(
    (kelvin) => {
      setManualWBKelvin(kelvin);
      setWbAuto(false);
      if (manualModeRef.current === "manual") {
        applyWhiteBalance(kelvin, manualWBTint);
      }
    },
    [applyWhiteBalance, manualWBTint],
  );

  const setWBTint = useCallback(
    (tint) => {
      setManualWBTint(tint);
      setWbAuto(false);
      if (manualModeRef.current === "manual") {
        applyWhiteBalance(manualWBKelvin, tint);
      }
    },
    [applyWhiteBalance, manualWBKelvin],
  );

  const resetWBToAuto = useCallback(() => {
    setWbAuto(true);
    if (manualModeRef.current === "manual" && available && deviceId) {
      setAutoWhiteBalance(deviceId).catch(() => {});
    }
  }, [available, deviceId]);

  const setFocus = useCallback(
    (lensPosition) => {
      setManualFocusValue(lensPosition);
      setFocusAuto(false);
      if (manualModeRef.current === "manual") {
        applyFocus(lensPosition);
      }
    },
    [applyFocus],
  );

  const resetFocusToAuto = useCallback(() => {
    setFocusAuto(true);
    if (manualModeRef.current === "manual" && available && deviceId) {
      setAutoFocus(deviceId).catch(() => {});
    }
  }, [available, deviceId]);

  const toggleManualMode = useCallback(() => {
    if (!available || !deviceId) return;

    if (manualModeRef.current === "auto") {
      setManualMode("manual");
      // Ao entrar no modo manual, os ajustes que ainda não foram tocados
      // pelo usuário começam em "auto" (mostrando "AUTO" na UI) e a câmera
      // permanece no modo automático nativo até o usuário mexer no slider.
      setIsoAuto(true);
      setShutterAuto(true);
      setWbAuto(true);
      setFocusAuto(true);
      setAutoExposure(deviceId).catch(() => {});
      setAutoWhiteBalance(deviceId).catch(() => {});
      setAutoFocus(deviceId).catch(() => {});
    } else {
      setManualMode("auto");
      setAutoExposure(deviceId).catch(() => {});
      setAutoWhiteBalance(deviceId).catch(() => {});
      setAutoFocus(deviceId).catch(() => {});
    }
  }, [available, deviceId]);

  return {
    available,
    capabilities,
    manualMode,
    toggleManualMode,
    manualISO,
    setISO,
    isoAuto,
    resetISOToAuto,
    manualShutterSeconds,
    setShutterSeconds,
    shutterAuto,
    resetShutterToAuto,
    exposureAuto: isoAuto && shutterAuto,
    manualWBKelvin,
    setWBKelvin,
    manualWBTint,
    setWBTint,
    wbAuto,
    resetWBToAuto,
    manualFocus,
    setFocus,
    focusAtPoint,
    focusAuto,
    resetFocusToAuto,
  };
}
