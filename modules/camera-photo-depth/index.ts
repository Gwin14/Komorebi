import { Platform } from "react-native";
import type { EventSubscription } from "expo-modules-core";

export type PhotoDepthState = {
  eligible: boolean;
  canRevert: boolean;
  canCopy?: boolean;
  reason: string;
};
export type PhotoDepthProgress = {
  assetId: string;
  operationId: string;
  progress: number;
  previewUri?: string;
  cancellable: boolean;
};

type NativeDepthModule = {
  getState(assetId: string): Promise<PhotoDepthState>;
  addDepth(assetId: string, operationId: string): Promise<string>;
  revertDepth(assetId: string, operationId: string): Promise<void>;
  cancel(operationId: string): void;
  exportCurrentPhoto(assetId: string, destination: string): Promise<string>;
  cleanupDeletedBackups(confirmedDeletedIds: string[]): Promise<void>;
  addListener(event: "onDepthProgress", listener: (event: PhotoDepthProgress) => void): EventSubscription;
};
let nativeModule: NativeDepthModule | null | undefined;
function getNativeModule() {
  if (nativeModule === undefined) {
    nativeModule = null;
    if (Platform.OS === "ios") {
      const { requireOptionalNativeModule } = require("expo-modules-core");
      nativeModule = requireOptionalNativeModule("CameraPhotoDepth");
    }
  }
  return nativeModule;
}
function requireModule(): NativeDepthModule {
  const module = getNativeModule();
  if (!module) throw new Error("Esta ação requer uma nova compilação do app iOS.");
  return module;
}
export async function getPhotoDepthState(assetId: string): Promise<PhotoDepthState> {
  return getNativeModule()?.getState(assetId) ?? {
    eligible: false,
    canRevert: false,
    reason: Platform.OS === "ios" ? "Disponível após recompilar o app iOS." : "Profundidade disponível apenas no iOS.",
  };
}
export async function addPhotoDepth(assetId: string, operationId: string) {
  return requireModule().addDepth(assetId, operationId);
}
export async function revertPhotoDepth(assetId: string, operationId: string) {
  return requireModule().revertDepth(assetId, operationId);
}
export async function cancelPhotoDepth(operationId: string) {
  getNativeModule()?.cancel(operationId);
}
export async function exportCurrentPhoto(assetId: string, destination: string) {
  return requireModule().exportCurrentPhoto(assetId, destination);
}
export async function cleanupDeletedDepthBackups(confirmedDeletedIds: string[] = []) {
  await getNativeModule()?.cleanupDeletedBackups(confirmedDeletedIds);
}
export function subscribeToPhotoDepth(listener: (event: PhotoDepthProgress) => void) {
  return getNativeModule()?.addListener("onDepthProgress", listener);
}
