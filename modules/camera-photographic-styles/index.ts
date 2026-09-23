import { Platform } from "react-native";

export type PhotographicStylesCompatibilityResult = {
  photoUri: string;
  verified: boolean;
};

let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("CameraPhotographicStyles");
  } catch {
    nativeModule = null;
  }
}

export function isPhotographicStylesCompatibilityAvailable(): boolean {
  return Boolean(nativeModule?.isSupported?.());
}

export async function makePhotoStylesCompatible(
  photoUri: string,
): Promise<PhotographicStylesCompatibilityResult> {
  if (!nativeModule) {
    throw new Error("Compatibilidade com Estilos Fotográficos indisponível neste dispositivo.");
  }
  return nativeModule.makeCompatible(photoUri);
}
