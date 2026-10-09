import { DEFAULT_ALBUM_NAME, getProjectAlbumName } from "./projects";

// Keep only recent descriptors in RAM. Originals and photo bytes belong to
// PhotoKit/the image cache; nothing is persisted past the app session.
const snapshots = new Map();
const MAX_ALBUMS = 4;
const MAX_PHOTOS = 240;

export const galleryCacheKey = (project) =>
  project ? getProjectAlbumName(project) : DEFAULT_ALBUM_NAME;

export function getCachedGalleryPhotos(project) {
  return snapshots.get(galleryCacheKey(project));
}

export function cacheGalleryPhotos(project, photos) {
  const key = galleryCacheKey(project);
  snapshots.delete(key);
  snapshots.set(key, photos.slice(0, MAX_PHOTOS));
  while (snapshots.size > MAX_ALBUMS) snapshots.delete(snapshots.keys().next().value);
}

export function clearGalleryCache() {
  snapshots.clear();
}
