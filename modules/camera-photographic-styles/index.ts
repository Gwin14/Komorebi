import { Platform } from "react-native";

export type PhotographicStylesCompatibilityResult = {
  photoUri: string;
  verified: boolean;
};

export type PhotographicStylesMetadata = {
  GPSLatitude?: number;
  GPSLongitude?: number;
  GPSAltitude?: number | null;
  removeGPS?: boolean;
  ISO?: number;
  ExposureTime?: number;
  ExposureMode?: number;
  ExposureProgram?: number;
  WhiteBalance?: number;
  DateTime?: string;
  DateTimeOriginal?: string;
  DateTimeDigitized?: string;
  SubSecTimeOriginal?: string;
  SubSecTimeDigitized?: string;
  Make?: string;
  Model?: string;
  LensMake?: string;
  LensModel?: string;
  FNumber?: number;
  FocalLength?: number;
  Flash?: number;
  MeteringMode?: number;
};

export type PhotographicStylesCompatibilityOptions = {
  metadata?: PhotographicStylesMetadata | null;
  metadataSourceUri?: string | null;
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
  options: PhotographicStylesCompatibilityOptions = {},
): Promise<PhotographicStylesCompatibilityResult> {
  if (!nativeModule) {
    throw new Error("Compatibilidade com Estilos Fotográficos indisponível neste dispositivo.");
  }
  return nativeModule.makeCompatible(photoUri, options);
}

export async function updatePhotoAssetMetadata(
  localIdentifier: string,
  options: PhotographicStylesCompatibilityOptions = {},
): Promise<boolean> {
  if (!nativeModule?.updateAssetMetadata) return false;
  return nativeModule.updateAssetMetadata(localIdentifier, options);
}
