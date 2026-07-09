import type { ComponentType } from "react";
import { Platform, View, type ViewProps } from "react-native";

export type LivePhotoCapabilities = {
  supportsLivePhotoCapture: boolean;
  canSaveToPhotoLibrary: boolean;
};

export type LivePhotoCaptureOptions = {
  deviceId: string;
  flashMode?: "off" | "on" | "auto";
};

export type LivePhotoCameraViewProps = ViewProps & {
  deviceId?: string | null;
  flashMode?: "off" | "on" | "auto";
  isActive?: boolean;
  onInitialized?: () => void;
  onError?: (event: { nativeEvent?: { message?: string } }) => void;
};

export type LivePhotoCaptureResult = {
  photoUri: string;
  movieUri: string;
  localIdentifier: string | null;
  savedToLibrary: boolean;
};

export type SaveLivePhotoOptions = {
  photoUri: string;
  movieUri: string;
  originalPhotoUri?: string | null;
  albumTitle?: string;
};

export type SaveLivePhotoResult = {
  localIdentifier: string | null;
  savedToLibrary: boolean;
};

const DEFAULT_CAPABILITIES: LivePhotoCapabilities = {
  supportsLivePhotoCapture: false,
  canSaveToPhotoLibrary: false,
};

let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraLivePhoto");
  } catch {
    nativeModule = null;
  }
}

export const LivePhotoCameraView: ComponentType<LivePhotoCameraViewProps> =
  Platform.OS === "ios" && nativeModule
    ? require("expo-modules-core").requireNativeViewManager("CameraLivePhoto")
    : View;

export function isLivePhotoCaptureAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

export async function getLivePhotoCapabilities(
  deviceId: string,
): Promise<LivePhotoCapabilities> {
  if (!nativeModule) return DEFAULT_CAPABILITIES;

  const capabilities = await nativeModule.getCapabilities(deviceId);
  return {
    supportsLivePhotoCapture: Boolean(capabilities.supportsLivePhotoCapture),
    canSaveToPhotoLibrary: Boolean(capabilities.canSaveToPhotoLibrary),
  };
}

export async function captureLivePhoto(
  options: LivePhotoCaptureOptions,
): Promise<LivePhotoCaptureResult> {
  if (!nativeModule) {
    throw new Error("CameraLivePhoto native module is not available");
  }

  const result = await nativeModule.captureLivePhoto({
    deviceId: options.deviceId,
    flashMode: options.flashMode ?? "off",
  });

  return {
    photoUri: result.photoUri,
    movieUri: result.movieUri,
    localIdentifier: result.localIdentifier ?? null,
    savedToLibrary: Boolean(result.savedToLibrary),
  };
}

export async function saveLivePhotoToLibrary(
  options: SaveLivePhotoOptions,
): Promise<SaveLivePhotoResult> {
  if (!nativeModule) {
    throw new Error("CameraLivePhoto native module is not available");
  }

  const result = await nativeModule.saveLivePhotoToLibrary({
    photoUri: options.photoUri,
    movieUri: options.movieUri,
    originalPhotoUri: options.originalPhotoUri ?? null,
    albumTitle: options.albumTitle ?? "Komorebi",
  });

  return {
    localIdentifier: result.localIdentifier ?? null,
    savedToLibrary: Boolean(result.savedToLibrary),
  };
}
