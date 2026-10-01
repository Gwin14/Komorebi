import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import {
  readCatalogRating,
  readPhotoAssetRating,
  setPhotoAssetRating,
  writeCatalogMetadata,
} from "../../modules/camera-photographic-styles";
import {
  readRating,
  writeJpegMetadata,
  writeTiffMetadata,
} from "./catalogMetadataCodec";

const pathFor = (uri) => uri.replace(/^file:\/\//, "");
const hasFields = (fields) => Boolean(
  fields.author || fields.copyright || fields.tags?.length || fields.rating !== undefined,
);
const readBinary = async (uri) => atob(await RNFS.readFile(pathFor(uri), "base64"));

export async function writePhotoCatalogMetadata(uri, fields) {
  if (!hasFields(fields)) return uri;
  // ImageIO preserves HEIF auxiliary images and the JPEG compressed representation.
  if (Platform.OS === "ios" && !/\.dng(?:[?#]|$)/i.test(uri)) {
    return writeCatalogMetadata(uri, fields);
  }
  const bytes = await readBinary(uri);
  const isJpeg = bytes.startsWith("\xff\xd8");
  const output = isJpeg ? writeJpegMetadata(bytes, fields) : writeTiffMetadata(bytes, fields);
  const destination = `${FileSystem.cacheDirectory}catalog-${Date.now()}-${Math.random().toString(36).slice(2)}.${isJpeg ? "jpg" : "dng"}`;
  await FileSystem.writeAsStringAsync(destination, btoa(output), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destination;
}

export async function readPhotoRating(uri, assetId = null) {
  try {
    if (Platform.OS === "ios") {
      if (assetId) {
        const libraryRating = await readPhotoAssetRating(assetId);
        if (libraryRating !== null) return libraryRating;
      }
      return await readCatalogRating(uri);
    }
    return readRating(await readBinary(uri));
  } catch (error) {
    console.warn("Não foi possível ler a classificação da foto", error);
    return null;
  }
}

export async function savePhotoRating(assetId, rating) {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error("Classificação inválida");
  if (Platform.OS === "ios") {
    if (!await setPhotoAssetRating(assetId, rating)) throw new Error("Foto não encontrada");
    return;
  }
  const info = await MediaLibrary.getAssetInfoAsync(assetId);
  const uri = info.localUri || info.uri;
  const original = await RNFS.readFile(pathFor(uri), "base64");
  const updated = writeJpegMetadata(atob(original), { rating });
  try {
    await RNFS.writeFile(pathFor(uri), btoa(updated), "base64");
    if (readRating(await readBinary(uri)) !== rating) throw new Error("A classificação não foi gravada");
  } catch (error) {
    // Restore the previous bytes if a provider fails during the write.
    await RNFS.writeFile(pathFor(uri), original, "base64").catch(() => {});
    throw error;
  }
}

export async function deleteCatalogTemporaryPhoto(uri) {
  if (!uri || !/\/komorebi-catalog-|\/catalog-/.test(uri)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn("Não foi possível remover o arquivo temporário de metadados", error);
  }
}
