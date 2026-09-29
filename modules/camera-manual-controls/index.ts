import { Platform } from "react-native";

export type CameraCapabilities = {
  minISO: number;
  maxISO: number;
  minExposureDurationSeconds: number;
  maxExposureDurationSeconds: number;
  supportsCustomExposure: boolean;
  supportsLockedWhiteBalance: boolean;
  supportsLockedFocus: boolean;
  maxWhiteBalanceGain: number;
  minFocusLensPosition: number;
  maxFocusLensPosition: number;
};

export type CameraZoomPreset = {
  zoomFactor: number;
  displayZoom: number;
  source: "physical" | "secondary-native";
};

export type CameraZoomCapabilities = {
  minZoom: number;
  maxZoom: number;
  displayZoomMultiplier: number;
  isVirtualDevice: boolean;
  presets: CameraZoomPreset[];
};

// The native module only exists on iOS (and not in Expo Go), so resolve it
// lazily and degrade to a no-op everywhere else.
let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraManualControls");
  } catch {
    nativeModule = null;
  }
}

/** Whether manual ISO/shutter/white balance/focus control is available on this device. */
export function isManualControlsAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

/** Reads the manual control ranges supported by the given camera device. */
export async function getCameraCapabilities(
  deviceId: string,
): Promise<CameraCapabilities | null> {
  if (!nativeModule) return null;
  return nativeModule.getCapabilities(deviceId);
}

/**
 * Reads the optical and native-resolution zoom stops exposed by AVFoundation.
 * Unlike model-name tables, this also discovers new devices and sensor-crop
 * modes such as the iPhone 17 Pro telephoto camera's 8x stop.
 */
export async function getCameraZoomCapabilities(
  deviceId: string,
): Promise<CameraZoomCapabilities | null> {
  if (!nativeModule?.getZoomCapabilities) return null;
  return nativeModule.getZoomCapabilities(deviceId);
}

export async function setManualExposure(
  deviceId: string,
  iso: number,
  durationSeconds: number,
): Promise<void> {
  await nativeModule?.setManualExposure?.(deviceId, iso, durationSeconds);
}

export async function setAutoExposure(deviceId: string): Promise<void> {
  await nativeModule?.setAutoExposure?.(deviceId);
}

export async function setManualWhiteBalance(
  deviceId: string,
  temperatureKelvin: number,
  tint: number,
): Promise<void> {
  await nativeModule?.setManualWhiteBalance?.(
    deviceId,
    temperatureKelvin,
    tint,
  );
}

export async function setAutoWhiteBalance(deviceId: string): Promise<void> {
  await nativeModule?.setAutoWhiteBalance?.(deviceId);
}

export async function setManualFocus(
  deviceId: string,
  lensPosition: number,
): Promise<void> {
  await nativeModule?.setManualFocus?.(deviceId, lensPosition);
}

export async function focusAtPoint(
  deviceId: string,
  pointX: number,
  pointY: number,
): Promise<void> {
  if (!nativeModule?.focusAtPoint) {
    throw new Error("focusAtPoint is not available");
  }

  await nativeModule?.focusAtPoint?.(deviceId, pointX, pointY);
}

export async function setAutoFocus(deviceId: string): Promise<void> {
  await nativeModule?.setAutoFocus?.(deviceId);
}
