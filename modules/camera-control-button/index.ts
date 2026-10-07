import { Platform } from "react-native";
import type { EventSubscription } from "expo-modules-core";

export type CameraButtonEvent = { type: "primary" | "secondary" };
type CameraButtonListener = (event: CameraButtonEvent) => void;

// Resolve lazily; degrade to a no-op in Expo Go and unsupported platforms.
let nativeModule: any = null;
if (Platform.OS === "ios" || Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraControlButton");
  } catch {
    nativeModule = null;
  }
}

/** Whether the hardware capture button bridge is available on this device. */
export function isCameraControlButtonAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

/** Attach the capture-event interaction. Safe to call when unavailable. */
export async function startListening(): Promise<void> {
  await nativeModule?.startListening?.();
}

/** Detach the capture-event interaction. */
export async function stopListening(): Promise<void> {
  await nativeModule?.stopListening?.();
}

/** Copy and clear photos captured by the iOS Locked Camera Capture extension. */
export async function consumePendingLockedCameraCaptures(): Promise<string[]> {
  if (!nativeModule?.consumePendingLockedCameraCaptures) {
    return [];
  }
  return nativeModule.consumePendingLockedCameraCaptures();
}

/** Subscribe to hardware capture button presses. Returns null when unavailable. */
export function addCameraButtonListener(
  listener: CameraButtonListener,
): EventSubscription | null {
  if (!nativeModule) {
    return null;
  }
  return nativeModule.addListener("onCameraButtonPressed", listener);
}
