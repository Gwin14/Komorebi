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

  const capabilities = await nativeModule.getCapabilities?.(deviceId) ?? DEFAULT_CAPABILITIES;
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

export type HeifPlusSettings = Record<string, number | boolean | null>;
export type HeifPlusRecipe = {
  decoder: string; bitDepth: number; width: number; height: number;
  appliedSettings: HeifPlusSettings; supportedControls: Record<string, boolean>;
  effectsApplied: boolean;
};
export type HeifPlusVariant = {
  file: string; photoUri: string; name: string; recipe: HeifPlusRecipe;
  assetId?: string; organized?: boolean;
};
export type HeifPlusJob = {
  id: string; state: "pending" | "rendered" | "saved" | "failed";
  createdAt: string; intelligenceCompleted?: boolean; error?: string; variants?: HeifPlusVariant[];
  komorebiMetadata?: Record<string, unknown>;
  catalogMetadata?: Record<string, unknown>;
  intelligence?: { generateTags: boolean; generateFilename: boolean };
};
export type HeifPlusInspection = {
  decoder: string; supportedControls: Record<string, boolean>; width: number; height: number;
};
export function isHeifPlusAvailable(): boolean { return Boolean(nativeModule?.enqueueHeifPlus); }
function heifPlusModule() {
  if (!isHeifPlusAvailable()) throw new Error("HEIF+ requer a versão nativa atualizada do Komorebi");
  return nativeModule;
}
export async function enqueueHeifPlus(uri: string, options: Record<string, unknown>): Promise<HeifPlusJob> {
  return heifPlusModule().enqueueHeifPlus(uri, options);
}
export async function listHeifPlusJobs(): Promise<HeifPlusJob[]> {
  return isHeifPlusAvailable() ? nativeModule.listHeifPlusJobs() : [];
}
export async function inspectHeifPlus(id: string): Promise<HeifPlusInspection> {
  return heifPlusModule().inspectHeifPlus(id);
}
export async function renderHeifPlus(id: string): Promise<HeifPlusJob> {
  return heifPlusModule().renderHeifPlus(id);
}
export async function enrichHeifPlus(id: string, data: Record<string, unknown>): Promise<void> {
  await heifPlusModule().enrichHeifPlus(id, data);
}
export async function saveHeifPlus(id: string): Promise<HeifPlusJob> {
  return heifPlusModule().saveHeifPlus(id);
}
export async function retryHeifPlus(id: string): Promise<void> { await heifPlusModule().retryHeifPlus(id); }
export async function discardHeifPlus(id: string): Promise<void> { await heifPlusModule().discardHeifPlus(id); }
