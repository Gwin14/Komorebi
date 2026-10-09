import * as MediaLibrary from "expo-media-library";
import { DEFAULT_ALBUM_NAME, getProjectAlbumName } from "./projects";
import { readPhotoRating } from "./photoCatalogMetadata";
import { cacheGalleryPhotos, getCachedGalleryPhotos } from "./galleryCache";

// Native reads already in progress may finish; never schedule another batch
// or publish their results after navigation, project changes or a newer load.
export async function loadGalleryPhotos(project, isCurrent, onPreview, resolveDetails = true) {
  const albums = await MediaLibrary.getAlbumsAsync();
  if (!isCurrent()) return null;
  const albumName = project ? getProjectAlbumName(project) : DEFAULT_ALBUM_NAME;
  const album = albums.find((item) => item.title === albumName);
  if (!album) {
    if (onPreview) onPreview([], true);
    return [];
  }
  let cursor;
  const seen = new Set();
  const listed = [];
  const cached = new Map((getCachedGalleryPhotos(project) || []).map((photo) => [photo.id, photo]));
  do {
    if (!isCurrent()) return null;
    const assets = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: "photo",
      sortBy: MediaLibrary.SortBy.creationTime,
      first: onPreview && !cursor ? 24 : 100,
      ...(cursor ? { after: cursor } : {}),
    });
    if (!isCurrent()) return null;
    for (const asset of assets.assets) {
      if (!asset?.uri || !asset?.id || !Number.isFinite(asset.creationTime) || seen.has(asset.id)) continue;
      seen.add(asset.id);
      const previous = cached.get(asset.id);
      listed.push({ ...asset, rating: previous?.rating ?? null });
    }
    // Publish descriptors before ANY original-file or EXIF/rating reads.
    if (onPreview) onPreview([...listed], !assets.hasNextPage);
    if (!assets.hasNextPage) break;
    if (!assets.endCursor || assets.endCursor === cursor)
      throw new Error("A biblioteca não avançou para a próxima página.");
    cursor = assets.endCursor;
  } while (isCurrent());
  if (!isCurrent()) return null;
  if (!resolveDetails) return listed;
  return resolveGalleryPhotoDetails(listed, isCurrent);
}

export async function resolveGalleryPhotoDetails(photos, isCurrent, onBatch) {
  const resolved = [];
  for (let index = 0; index < photos.length; index += 4) {
    if (!isCurrent()) return null;
    const batch = await Promise.all(
      photos.slice(index, index + 4).map(async (asset) => {
        try {
          let uri = asset.uri;
          if (uri.startsWith("ph://")) {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            if (!isCurrent()) return null;
            uri = info.localUri || asset.uri;
          }
          const rating = await readPhotoRating(uri, asset.id);
          return isCurrent() ? { ...asset, uri, rating } : null;
        } catch (error) {
          console.warn("Não foi possível carregar o asset da galeria:", asset.id, error);
          return asset;
        }
      }),
    );
    if (!isCurrent()) return null;
    resolved.push(...batch.filter(Boolean));
    if (onBatch) onBatch(batch.filter(Boolean));
  }
  return isCurrent() ? resolved : null;
}

// A small, cancellable warm-up after the camera is ready. Never resolve
// originals, read ratings or download iCloud files on the camera screen.
export async function warmGalleryPhotos(project, isCurrent) {
  if (getCachedGalleryPhotos(project) !== undefined || !isCurrent()) return;
  const albums = await MediaLibrary.getAlbumsAsync();
  if (!isCurrent()) return;
  const name = project ? getProjectAlbumName(project) : DEFAULT_ALBUM_NAME;
  const album = albums.find((item) => item.title === name);
  if (!album) return;
  const page = await MediaLibrary.getAssetsAsync({
    album,
    mediaType: "photo",
    sortBy: MediaLibrary.SortBy.creationTime,
    first: 24,
  });
  if (!isCurrent() || getCachedGalleryPhotos(project) !== undefined) return;
  cacheGalleryPhotos(project, page.assets.filter((asset) =>
    asset?.id && asset?.uri && Number.isFinite(asset.creationTime),
  ));
}
