import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { VisionCameraProxy } from "react-native-vision-camera";
import type { FrameProcessorPlugin } from "react-native-vision-camera";

export type ScanState = "idle" | "capturing" | "analyzing" | "showing-results";
export type NormalizedPoint = { x: number; y: number };
export type NormalizedRect = NormalizedPoint & { width: number; height: number };
export type SceneSubject = { rect: NormalizedRect; confidence: number; yaw?: number };
export type CompositionFrame = { centerX: number; centerY: number; width: number; height: number };
export type CompositionVisualHint = "framing" | "reframe" | "closer" | "farther" |
  "look_space" | "center_symmetry" | "level";
export type CompositionJudgement = {
  source: "minicpm-v-4.6";
  verdict: "keep" | "advice";
  message: string;
  topic: string;
  subject?: string | null;
  cropIntent?: "tight" | "medium" | "wide" | null;
  visualHint?: CompositionVisualHint | null;
  frame?: CompositionFrame | null;
};
export type CompositionAnalysis = {
  geometry: { width: number; height: number; mirrored: boolean; rotation: 0 | 90 | 180 | 270 };
  horizon: { angle: number; confidence: number } | null;
  people: SceneSubject[];
  faces: SceneSubject[];
  subjects: SceneSubject[];
  rectangles: SceneSubject[];
  judgement?: CompositionJudgement | null;
};
export type CompositionGizmo = {
  id: string;
  type: "framing";
  rect: NormalizedRect;
  label: string;
  anchor: "scene";
};
export type ScanResult = {
  kind: "advice" | "balanced" | "no-new-advice";
  message: string;
  gizmos: CompositionGizmo[];
};
export interface CompositionModel {
  analyze(imageToken: string, scanId: string, context?: CompositionAnalysisContext): Promise<CompositionAnalysis>;
  cancel(scanId: string): Promise<void>;
}

export type CompositionAnalysisContext = {
  recentAdvice: Array<{ topic: string; message: string }>;
  frameAspectRatio?: number;
  subjectPoint?: NormalizedPoint | null;
  previewWidth?: number;
  previewHeight?: number;
};
export type CompositionTrackingUpdate = {
  scanId: string;
  matrix: number[];
  confidence: number;
  lost: boolean;
};

type NativeScan = CompositionModel & {
  arm(scanId: string): Promise<boolean>;
  getCompositionModelStatus(): Promise<CompositionModelStatus>;
  downloadCompositionModel(): Promise<boolean>;
  cancelCompositionModelDownload(): Promise<void>;
  deleteCompositionModel(): Promise<void>;
  addListener(eventName: "onCompositionModelStatus", listener: (status: CompositionModelStatus) => void): { remove(): void };
  addListener(eventName: "onCompositionTrackingUpdate", listener: (update: CompositionTrackingUpdate) => void): { remove(): void };
};
export type CompositionModelStatus = {
  state: "runtime-missing" | "unsupported" | "not-downloaded" | "downloading" | "ready" | "error";
  modelName: string;
  isReady: boolean;
  isCompatible: boolean;
  runtimeAvailable: boolean;
  storageBytes: number;
  progress?: number;
  error?: string;
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
export async function analyze(imageToken: string, scanId: string, context: CompositionAnalysisContext = { recentAdvice: [] }): Promise<CompositionAnalysis> {
  if (!nativeModule) throw new Error("Composition Scan unavailable");
  return nativeModule.analyze(imageToken, scanId, context);
}
export async function cancel(scanId: string): Promise<void> {
  await nativeModule?.cancel(scanId);
}
export async function getCompositionModelStatus(): Promise<CompositionModelStatus | null> {
  return nativeModule?.getCompositionModelStatus() ?? null;
}
export async function downloadCompositionModel(): Promise<boolean> {
  if (!nativeModule) throw new Error("Composition Scan unavailable");
  return nativeModule.downloadCompositionModel();
}
export async function cancelCompositionModelDownload(): Promise<void> {
  await nativeModule?.cancelCompositionModelDownload();
}
export async function deleteCompositionModel(): Promise<void> {
  if (!nativeModule) throw new Error("Composition Scan unavailable");
  await nativeModule.deleteCompositionModel();
}
export function addCompositionModelStatusListener(listener: (status: CompositionModelStatus) => void) {
  return nativeModule?.addListener("onCompositionModelStatus", listener) ?? { remove() {} };
}
export function addCompositionTrackingListener(listener: (update: CompositionTrackingUpdate) => void) {
  return nativeModule?.addListener("onCompositionTrackingUpdate", listener) ?? { remove() {} };
}
