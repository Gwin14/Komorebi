import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import { exportCurrentPhoto } from "../../modules/camera-photo-depth";
import { savePhotoRating } from "./photoCatalogMetadata";
import { runSequentialPhotoAction, withGalleryAssets } from "./galleryActionState";

export function rateGalleryPhotos(ids, rating, options) {
  return withGalleryAssets(ids, () =>
    runSequentialPhotoAction(ids, async (id) => {
      await savePhotoRating(id, rating);
      // Preview refresh failure must not turn a confirmed write into a failure.
      let uri;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(id);
        uri = info.localUri || info.uri;
      } catch {
        // The next library refresh resolves the current rendition.
      }
      options?.onSaved?.(id, rating, uri);
    }, options),
  );
}

export function deleteGalleryPhotos(ids) {
  return withGalleryAssets(ids, () => MediaLibrary.deleteAssetsAsync([...ids]));
}

export function shareGalleryPhotos(ids, options = {}) {
  return withGalleryAssets(ids, async () => {
    if (Platform.OS === "web") throw new Error("Compartilhamento disponível no app iOS e Android.");
    let Share;
    try {
      const module = require("react-native-share");
      Share = module.default || module;
    } catch {
      throw new Error("Recompile o app para habilitar o compartilhamento.");
    }
    const directory = `${FileSystem.cacheDirectory}gallery-share-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    try {
      const urls = [];
      for (const id of ids) {
        if (options.isCancelled?.()) return;
        const destination = `${directory}${urls.length}`;
        if (Platform.OS === "ios") {
          // PhotoKit's editing input resolves the current full-size rendition,
          // including other apps' edits and resources stored only in iCloud.
          urls.push(await exportCurrentPhoto(id, destination));
        } else {
          const info = await MediaLibrary.getAssetInfoAsync(id, {
            shouldDownloadFromNetwork: true,
          });
          const uri = info.localUri || info.uri;
          if (!uri || (!uri.startsWith("file://") && !uri.startsWith("content://")))
            throw new Error("Não foi possível preparar uma das fotos.");
          const extension = info.filename?.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg";
          const target = `${destination}.${extension}`;
          await FileSystem.copyAsync({ from: uri, to: target });
          urls.push(target);
        }
        options.onProgress?.({ completed: urls.length, total: ids.length });
      }
      if (options.isCancelled?.()) return;
      await Share.open({ urls, failOnCancel: false });
    } finally {
      // Keep files alive while the native sheet consumes them.
      await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {});
    }
  });
}
