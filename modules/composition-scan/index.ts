import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { VisionCameraProxy } from "react-native-vision-camera";
import type { FrameProcessorPlugin } from "react-native-vision-camera";

export type ScanState = "idle" | "capturing" | "analyzing" | "showing-results";
export type NormalizedPoint = { x: number; y: number };
export type NormalizedRect = NormalizedPoint & { width: number; height: number };
export type SceneSubject = { rect: NormalizedRect; confidence: number; yaw?: number };
export type CompositionAnalysis = {
  geometry: { width: number; height: number; mirrored: boolean; rotation: 0 | 90 | 180 | 270 };
  horizon: { angle: number; confidence: number } | null;
  people: SceneSubject[];
  faces: SceneSubject[];
  subjects: SceneSubject[];
  rectangles: SceneSubject[];
};
export type CompositionGizmo =
  | { id: string; type: "alignment"; angle: number; referenceAngle: number; label: string }
  | { id: string; type: "target"; point: NormalizedPoint; label: string }
  | { id: string; type: "look-space"; point: NormalizedPoint; direction: "left" | "right"; label: string }
  | { id: string; type: "margin"; rect: NormalizedRect; label: string }
  | { id: string; type: "center"; point: NormalizedPoint; label: string }
  | { id: string; type: "scale"; rect: NormalizedRect; direction: "in" | "out"; label: string };
export type ScanResult = { gizmos: CompositionGizmo[] };
export interface CompositionModel {
  analyze(imageToken: string, scanId: string): Promise<CompositionAnalysis>;
  cancel(scanId: string): Promise<void>;
}

type NativeScan = CompositionModel & {
  arm(scanId: string): Promise<boolean>;
};
const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<NativeScan>("CompositionScan")
  : null;
let plugin: FrameProcessorPlugin | undefined;
export function getCompositionCapturePlugin() {
  if (!plugin && nativeModule) {
    try {
      plugin = VisionCameraProxy.initFrameProcessorPlugin("captureCompositionFrame", {});
    } catch {
      plugin = undefined;
    }
  }
  return plugin;
}
export function isCompositionScanAvailable() {
  return Boolean(nativeModule && getCompositionCapturePlugin());
}
export function isCompositionScanSupported() {
  return Platform.OS === "ios";
}
export async function armCompositionScan(scanId: string) {
  return nativeModule?.arm(scanId) ?? false;
}
export async function analyze(imageToken: string, scanId: string): Promise<CompositionAnalysis> {
  if (!nativeModule) throw new Error("Composition Scan unavailable");
  return nativeModule.analyze(imageToken, scanId);
}
export async function cancel(scanId: string): Promise<void> {
  await nativeModule?.cancel(scanId);
}
