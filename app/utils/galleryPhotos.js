import * as MediaLibrary from "expo-media-library";
import { DEFAULT_ALBUM_NAME, getProjectAlbumName } from "./projects";
import { readPhotoRating } from "./photoCatalogMetadata";

// Native reads already in progress may finish; never schedule another batch
// or publish their results after navigation, project changes or a newer load.
export async function loadGalleryPhotos(project, isCurrent) {
  const albums = await MediaLibrary.getAlbumsAsync();
  if (!isCurrent()) return null;
  const albumName = project ? getProjectAlbumName(project) : DEFAULT_ALBUM_NAME;
  const album = albums.find((item) => item.title === albumName);
  if (!album) return [];
  let cursor;
  const seen = new Set();
  const resolved = [];
  do {
    if (!isCurrent()) return null;
    const assets = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: "photo",
      sortBy: MediaLibrary.SortBy.creationTime,
      first: 100,
      ...(cursor ? { after: cursor } : {}),
    });
    if (!isCurrent()) return null;
    for (let index = 0; index < assets.assets.length; index += 4) {
      if (!isCurrent()) return null;
      const batch = await Promise.all(
        assets.assets.slice(index, index + 4).map(async (asset) => {
          if (!asset?.uri || !asset?.id) return null;
          if (!asset.uri.startsWith("ph://")) {
            return {
              ...asset,
              rating: await readPhotoRating(asset.uri, asset.id),
            };
          }
          try {
            // Listing the grid must not download every original from iCloud.
            // Actions resolve full-size resources separately when requested.
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            if (!isCurrent()) return null;
            const uri = info.localUri || asset.uri;
            return {
              ...asset,
              uri,
              rating: await readPhotoRating(uri, asset.id),
            };
          } catch (error) {
            console.warn(
              "Não foi possível carregar o asset da galeria:",
              asset.id,
              error,
            );
            // An unavailable preview does not mean the asset was deleted. Keep
            // its ID in the grid so failed batch actions remain retryable.
            return { ...asset, rating: null };
          }
        }),
      );
      resolved.push(
        ...batch.filter((asset) => {
          if (!asset || !Number.isFinite(asset.creationTime) || seen.has(asset.id)) return false;
          seen.add(asset.id);
          return true;
        }),
      );
    }
    if (!assets.hasNextPage) break;
    if (!assets.endCursor || assets.endCursor === cursor)
      throw new Error("A biblioteca não avançou para a próxima página.");
    cursor = assets.endCursor;
  } while (isCurrent());
  return isCurrent() ? resolved : null;
}
