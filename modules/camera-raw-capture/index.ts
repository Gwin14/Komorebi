import { Platform } from "react-native";

export type RawCaptureMode = "off" | "proRaw" | "raw";

export type RawCaptureCapabilities = {
  supportsRawCapture: boolean;
  supportsBayerRawCapture: boolean;
  supportsProRawCapture: boolean;
  supportedModes: RawCaptureMode[];
};

export const RAW_CAPTURE_MODES: RawCaptureMode[] = ["off", "proRaw", "raw"];

const DEFAULT_CAPABILITIES: RawCaptureCapabilities = {
  supportsRawCapture: false,
  supportsBayerRawCapture: false,
  supportsProRawCapture: false,
  supportedModes: ["off"],
};

let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraRawCapture");
  } catch {
    nativeModule = null;
  }
}

export function isRawCaptureAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

export async function getRawCaptureCapabilities(
  deviceId: string,
): Promise<RawCaptureCapabilities> {
  if (!nativeModule) return DEFAULT_CAPABILITIES;

  const capabilities = await nativeModule.getCapabilities(deviceId);
  return {
    supportsRawCapture: Boolean(capabilities.supportsRawCapture),
    supportsBayerRawCapture: Boolean(capabilities.supportsBayerRawCapture),
    supportsProRawCapture: Boolean(capabilities.supportsProRawCapture),
    supportedModes: normalizeSupportedModes(capabilities.supportedModes),
  };
}

export function normalizeRawCaptureMode(mode: unknown): RawCaptureMode {
  return RAW_CAPTURE_MODES.includes(mode as RawCaptureMode)
    ? (mode as RawCaptureMode)
    : "off";
}

export function normalizeSupportedModes(modes: unknown): RawCaptureMode[] {
  if (!Array.isArray(modes)) return ["off"];

  const supportedModes = [
    ...new Set(
      modes.filter((mode): mode is RawCaptureMode =>
        RAW_CAPTURE_MODES.includes(mode as RawCaptureMode),
      ),
    ),
  ];

  return supportedModes.includes("off") ? supportedModes : ["off"];
}

export function isRawCaptureModeSupported(
  mode: RawCaptureMode,
  capabilities: RawCaptureCapabilities | null,
): boolean {
  if (mode === "off") return true;
  return Boolean(capabilities?.supportedModes?.includes(mode));
}

export function getNextRawCaptureMode(
  currentMode: RawCaptureMode,
  capabilities: RawCaptureCapabilities | null,
): RawCaptureMode {
  const supportedModes = capabilities?.supportedModes?.length
    ? capabilities.supportedModes
    : ["off"];
  const sequence = RAW_CAPTURE_MODES.filter((mode) =>
    supportedModes.includes(mode),
  );
  const currentIndex = sequence.indexOf(currentMode);

  if (currentIndex < 0) return sequence[0] ?? "off";
  return sequence[(currentIndex + 1) % sequence.length] ?? "off";
}

export function toVisionCameraRawMode(mode: RawCaptureMode): string {
  return normalizeRawCaptureMode(mode);
}
