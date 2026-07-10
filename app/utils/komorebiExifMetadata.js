import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as piexif from "piexifjs";
import { AVAILABLE_LUTS } from "./lutCatalog";

const KOMOREBI_USER_COMMENT_PREFIX = "KOMOREBI_JSON_BASE64:";
const KOMOREBI_ASSET_METADATA_PREFIX = "@komorebi/assetMetadata/";
const SCHEMA_VERSION = 1;

const base64Chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const encodeBase64 = (input) => {
  const bytes = [];
  const text = String(input);

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      i += 1;
      const next = text.charCodeAt(i);
      code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = bytes[i + 1];
    const third = bytes[i + 2];
    const triplet = (first << 16) | ((second || 0) << 8) | (third || 0);

    output += base64Chars[(triplet >> 18) & 0x3f];
    output += base64Chars[(triplet >> 12) & 0x3f];
    output += second === undefined ? "=" : base64Chars[(triplet >> 6) & 0x3f];
    output += third === undefined ? "=" : base64Chars[triplet & 0x3f];
  }

  return output;
};

const decodeBase64 = (input) => {
  const cleanInput = String(input).replace(/=+$/, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleanInput.length; i += 1) {
    const value = base64Chars.indexOf(cleanInput[i]);
    if (value === -1) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  let output = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];

    if (byte < 0x80) {
      output += String.fromCharCode(byte);
    } else if (byte >= 0xc0 && byte < 0xe0) {
      const second = bytes[++i];
      output += String.fromCharCode(((byte & 0x1f) << 6) | (second & 0x3f));
    } else if (byte >= 0xe0 && byte < 0xf0) {
      const second = bytes[++i];
      const third = bytes[++i];
      output += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f),
      );
    } else {
      const second = bytes[++i];
      const third = bytes[++i];
      const fourth = bytes[++i];
      const codePoint =
        ((byte & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      const adjusted = codePoint - 0x10000;
      output += String.fromCharCode(
        0xd800 + (adjusted >> 10),
        0xdc00 + (adjusted & 0x3ff),
      );
    }
  }

  return output;
};

const isBuiltInLut = (lutId) =>
  AVAILABLE_LUTS.some((lut) => lut.id === lutId && lut.file);

const formatAspectRatio = (ratio) => {
  if (!ratio) return null;
  if (Math.abs(ratio - 3 / 4) < 0.01) return "3:4";
  if (Math.abs(ratio - 9 / 16) < 0.01) return "9:16";
  if (Math.abs(ratio - 4 / 3) < 0.01) return "4:3";
  if (Math.abs(ratio - 16 / 9) < 0.01) return "16:9";
  return Number(ratio).toFixed(2);
};

const compactObject = (object) =>
  Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );

export const buildKomorebiExifMetadata = ({
  selectedLut,
  selectedLutId = "none",
  grainConfig = null,
  aspectRatio,
  doubleCaptureMode = false,
  captureMode = "standard",
  manualSettings = null,
} = {}) => {
  const lutId = selectedLut?.id || selectedLutId;
  const hasFilter = lutId && lutId !== "none";
  const appVersion =
    Constants.expoConfig?.version || Constants.manifest?.version || "unknown";
  const manual = compactObject({
    iso: manualSettings?.iso ?? undefined,
    shutterSeconds: manualSettings?.shutterSeconds ?? undefined,
    wbKelvin: manualSettings?.wbKelvin ?? undefined,
  });

  return compactObject({
    app: "Komorebi",
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    createdAt: new Date().toISOString(),
    filter: hasFilter
      ? {
          id: lutId,
          name: selectedLut?.name || lutId,
          source: isBuiltInLut(lutId) ? "built-in" : "custom",
        }
      : null,
    grain: {
      enabled: Boolean(grainConfig),
      config: grainConfig || undefined,
    },
    aspectRatio,
    aspectRatioLabel: formatAspectRatio(aspectRatio),
    doubleCaptureMode: Boolean(doubleCaptureMode),
    captureMode,
    manual: Object.keys(manual).length ? manual : undefined,
  });
};

export const encodeKomorebiExifMetadata = (metadata) => {
  if (!metadata || metadata.app !== "Komorebi") return null;
  return `${KOMOREBI_USER_COMMENT_PREFIX}${encodeBase64(
    JSON.stringify(metadata),
  )}`;
};

const normalizeUserComment = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value
      .map((byte) =>
        typeof byte === "number" && byte > 0 ? String.fromCharCode(byte) : "",
      )
      .join("");
  }

  return null;
};

export const decodeKomorebiExifMetadata = (value) => {
  try {
    const comment = normalizeUserComment(value);
    if (!comment || !comment.startsWith(KOMOREBI_USER_COMMENT_PREFIX)) {
      return null;
    }

    const metadata = JSON.parse(
      decodeBase64(comment.slice(KOMOREBI_USER_COMMENT_PREFIX.length)),
    );

    return metadata?.app === "Komorebi" ? metadata : null;
  } catch (_error) {
    return null;
  }
};

export const applyKomorebiMetadataToExifObj = (exifObj, metadata) => {
  const encodedMetadata = encodeKomorebiExifMetadata(metadata);
  if (!encodedMetadata) return;

  exifObj["Exif"] = exifObj["Exif"] || {};
  exifObj["Exif"][piexif.ExifIFD.UserComment] = encodedMetadata;
};

export const readKomorebiExifMetadataFromUri = async (uri) => {
  try {
    if (!uri) return null;

    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const exifObj = piexif.load(`data:image/jpeg;base64,${base64Data}`);

    return decodeKomorebiExifMetadata(
      exifObj?.["Exif"]?.[piexif.ExifIFD.UserComment],
    );
  } catch (_error) {
    return null;
  }
};

export const saveKomorebiAssetMetadata = async (assetId, metadata) => {
  try {
    if (!assetId || !metadata || metadata.app !== "Komorebi") return;

    await AsyncStorage.setItem(
      `${KOMOREBI_ASSET_METADATA_PREFIX}${assetId}`,
      JSON.stringify(metadata),
    );
  } catch (error) {
    console.log("Erro ao salvar metadados Komorebi do asset:", error);
  }
};

export const readKomorebiAssetMetadata = async (assetId) => {
  try {
    if (!assetId) return null;

    const value = await AsyncStorage.getItem(
      `${KOMOREBI_ASSET_METADATA_PREFIX}${assetId}`,
    );
    if (!value) return null;

    const metadata = JSON.parse(value);
    return metadata?.app === "Komorebi" ? metadata : null;
  } catch (_error) {
    return null;
  }
};
