import type { ComponentType } from "react";
import { Platform, View, type ViewProps } from "react-native";

export type ImageStackingStrategyId =
  | "bulb"
  | "motionBlur"
  | "doubleExposure";

export type ImageStackingState =
  | "idle"
  | "preparing"
  | "capturing"
  | "awaitingSecondExposure"
  | "analyzing"
  | "compositing"
  | "exporting"
  | "completed"
  | "cancelled"
  | "failed";

type BaseCaptureRequest = {
  deviceId: string;
  outputFormat?: "heif" | "jpeg";
};

export type ImageStackingCaptureRequest =
  | (BaseCaptureRequest & {
      strategyId: "bulb";
      maximumDurationSeconds?: number;
    })
  | (BaseCaptureRequest & {
      strategyId: "motionBlur";
      maximumDurationSeconds?: number;
    })
  | (BaseCaptureRequest & {
      strategyId: "doubleExposure";
      exposureCompensationEV?: number;
    });

export type ImageStackingCapabilities = {
  available: boolean;
  supportedStrategies: ImageStackingStrategyId[];
  maximumBulbDurationSeconds: number;
};

export type ImageStackingProgress = {
  state: ImageStackingState;
  strategyId: ImageStackingStrategyId | null;
  capturedFrames: number;
  acceptedFrames: number;
  rejectedFrames: number;
  elapsedSeconds: number;
  progress: number;
};

export type ImageStackingResult = {
  photoUri: string;
  strategyId: ImageStackingStrategyId;
  capturedFrames: number;
  acceptedFrames: number;
  rejectedFrames: number;
  durationSeconds: number;
  width: number;
  height: number;
  degraded: boolean;
};

export type ImageStackingCameraViewProps = ViewProps & {
  deviceId?: string | null;
  isActive?: boolean;
  histogramEnabled?: boolean;
  zebraHighlightsEnabled?: boolean;
  zebraShadowsEnabled?: boolean;
  exposureBias?: number;
  onInitialized?: () => void;
  onError?: (event: { nativeEvent?: { message?: string } }) => void;
  onHistogramUpdated?: (event: {
    nativeEvent?: { bins?: number[] };
    bins?: number[];
  }) => void;
  onStackingProgress?: (event: {
    nativeEvent?: Partial<ImageStackingProgress>;
  }) => void;
};

const DEFAULT_CAPABILITIES: ImageStackingCapabilities = {
  available: false,
  supportedStrategies: [],
  maximumBulbDurationSeconds: 0,
};

let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraImageStacking");
  } catch {
    nativeModule = null;
  }
}

export const ImageStackingCameraView: ComponentType<ImageStackingCameraViewProps> =
  Platform.OS === "ios" && nativeModule
    ? require("expo-modules-core").requireNativeViewManager(
        "CameraImageStacking",
      )
    : View;

export function isImageStackingAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

export async function getImageStackingCapabilities(
  deviceId: string,
): Promise<ImageStackingCapabilities> {
  if (!nativeModule) return DEFAULT_CAPABILITIES;
  const value = await nativeModule.getCapabilities(deviceId);
  return {
    available: Boolean(value.available),
    supportedStrategies: Array.isArray(value.supportedStrategies)
      ? value.supportedStrategies
      : [],
    maximumBulbDurationSeconds: Number(
      value.maximumBulbDurationSeconds || 0,
    ),
  };
}

export async function startImageStackingCapture(
  request: ImageStackingCaptureRequest,
): Promise<ImageStackingResult> {
  if (!nativeModule) {
    throw new Error("CameraImageStacking native module is not available");
  }
  return nativeModule.startImageStackingCapture(request);
}

export async function stopImageStackingCapture(): Promise<void> {
  await nativeModule?.stopImageStackingCapture?.();
}

export async function captureNextImageStackingExposure(): Promise<void> {
  await nativeModule?.captureNextImageStackingExposure?.();
}

export async function cancelImageStackingCapture(): Promise<void> {
  await nativeModule?.cancelImageStackingCapture?.();
}
