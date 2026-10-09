import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGalleryPhotos } from "../utils/galleryCache";
import { resolveGalleryPhotoDetails } from "../utils/galleryPhotos";

// Read ratings/local files only for visible rows (and the open photo), with
// bounded native concurrency. A long library never delays the first grid.
export default function useGalleryPhotoDetails({ photos, setPhotos, project, enabled, revision, generation, selectedAssetId }) {
  const [visibleIds, setVisibleIds] = useState([]);
  const latest = useRef(null);
  latest.current = { photos, project, enabled, revision };
  const completed = useRef(new Set());
  const completedRevision = useRef(revision);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    const ids = viewableItems.flatMap(({ item }) => Array.isArray(item) ? item.map((photo) => photo.id) : []);
    setVisibleIds((previous) => previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids);
  }, []);

  useEffect(() => {
    if (completedRevision.current !== revision) {
      completed.current.clear();
      completedRevision.current = revision;
    }
    if (!enabled) return;
    const ids = new Set([...visibleIds, selectedAssetId].filter(Boolean));
    const pending = latest.current.photos.filter((photo) => ids.has(photo.id) && !completed.current.has(photo.id));
    if (!pending.length) return;
    let active = true;
    const loadGeneration = generation.current;
    const current = () => active && latest.current.enabled && generation.current === loadGeneration;
    void resolveGalleryPhotoDetails(pending, current, (batch) => {
      if (!current()) return;
      batch.forEach((photo) => completed.current.add(photo.id));
      const updates = new Map(batch.map((photo) => [photo.id, photo]));
      setPhotos((previous) => {
        if (!current()) return previous;
        const next = previous.map((photo) => updates.get(photo.id) || photo);
        cacheGalleryPhotos(project, next);
        return next;
      });
    }).catch((error) => console.warn("Não foi possível ler os detalhes das fotos", error));
    return () => { active = false; };
  }, [visibleIds, selectedAssetId, revision, enabled, generation, project, setPhotos]);

  return onViewableItemsChanged;
}
