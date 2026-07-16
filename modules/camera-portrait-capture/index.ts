import type { ComponentType } from "react";
import { Platform, View, type ViewProps } from "react-native";

export type PortraitCaptureCapabilities = {
  supportsPortraitCapture: boolean;
  supportsDepthData: boolean;
  supportsPortraitEffectsMatte: boolean;
  canSaveToPhotoLibrary: boolean;
};

export type PortraitCaptureOptions = {
  deviceId: string;
  flashMode?: "off" | "on" | "auto";
};

export type PortraitCameraViewProps = ViewProps & {
  deviceId?: string | null;
  flashMode?: "off" | "on" | "auto";
  isActive?: boolean;
  smileDetectionEnabled?: boolean;
  histogramEnabled?: boolean;
  onSmileDetected?: () => void;
  onHistogramUpdated?: (event: {
    nativeEvent?: { bins?: number[] };
    bins?: number[];
  }) => void;
  onInitialized?: () => void;
  onError?: (event: { nativeEvent?: { message?: string } }) => void;
};

export type PortraitCaptureResult = {
  photoUri: string;
  localIdentifier: string | null;
  savedToLibrary: boolean;
  depthDataEmbedded: boolean;
  portraitEffectsMatteEmbedded: boolean;
};

export type SaveProcessedPortraitPhotoOptions = {
  processedPhotoUri: string;
  originalPhotoUri?: string | null;
  albumTitle?: string;
};

export type SaveProcessedPortraitPhotoResult = {
  localIdentifier: string | null;
  savedToLibrary: boolean;
  auxiliaryDataPreserved: boolean;
};

const DEFAULT_CAPABILITIES: PortraitCaptureCapabilities = {
  supportsPortraitCapture: false,
  supportsDepthData: false,
  supportsPortraitEffectsMatte: false,
  canSaveToPhotoLibrary: false,
};

let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraPortraitCapture");
  } catch {
    nativeModule = null;
  }
}

export const PortraitCameraView: ComponentType<PortraitCameraViewProps> =
  Platform.OS === "ios" && nativeModule
    ? require("expo-modules-core").requireNativeViewManager(
        "CameraPortraitCapture",
      )
    : View;

export function isPortraitCaptureAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

export async function getPortraitCaptureCapabilities(
  deviceId: string,
): Promise<PortraitCaptureCapabilities> {
  if (!nativeModule) return DEFAULT_CAPABILITIES;

  const capabilities = await nativeModule.getCapabilities(deviceId);
  return {
    supportsPortraitCapture: Boolean(capabilities.supportsPortraitCapture),
    supportsDepthData: Boolean(capabilities.supportsDepthData),
    supportsPortraitEffectsMatte: Boolean(
      capabilities.supportsPortraitEffectsMatte,
    ),
    canSaveToPhotoLibrary: Boolean(capabilities.canSaveToPhotoLibrary),
  };
}

export async function capturePortraitPhoto(
  options: PortraitCaptureOptions,
): Promise<PortraitCaptureResult> {
  if (!nativeModule) {
    throw new Error("CameraPortraitCapture native module is not available");
  }

  const result = await nativeModule.capturePortraitPhoto({
    deviceId: options.deviceId,
    flashMode: options.flashMode ?? "off",
  });

  return {
    photoUri: result.photoUri,
    localIdentifier: result.localIdentifier ?? null,
    savedToLibrary: Boolean(result.savedToLibrary),
    depthDataEmbedded: Boolean(result.depthDataEmbedded),
    portraitEffectsMatteEmbedded: Boolean(
      result.portraitEffectsMatteEmbedded,
    ),
  };
}

export async function saveProcessedPortraitPhoto(
  options: SaveProcessedPortraitPhotoOptions,
): Promise<SaveProcessedPortraitPhotoResult> {
  if (!nativeModule) {
    throw new Error("CameraPortraitCapture native module is not available");
  }

  const result = await nativeModule.saveProcessedPortraitPhoto({
    processedPhotoUri: options.processedPhotoUri,
    originalPhotoUri: options.originalPhotoUri ?? null,
    albumTitle: options.albumTitle ?? "Komorebi",
  });

  return {
    localIdentifier: result.localIdentifier ?? null,
    savedToLibrary: Boolean(result.savedToLibrary),
    auxiliaryDataPreserved: Boolean(result.auxiliaryDataPreserved),
  };
}
