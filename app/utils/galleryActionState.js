// IDs survive pagination, refreshes and changes to the order of the grid.
export function togglePhotoSelection(ids, id) {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function retainPhotoSelection(ids, photos) {
  const available = new Set(photos.map((photo) => photo.id));
  return new Set([...ids].filter((id) => available.has(id)));
}

export async function runSequentialPhotoAction(ids, action, options = {}) {
  const succeeded = [];
  const failed = [];
  const snapshot = [...new Set(ids)];
  let completed = 0;
  for (const id of snapshot) {
    if (options.isCancelled?.()) break;
    try {
      await action(id);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error });
    }
    completed += 1;
    options.onProgress?.({ completed, total: snapshot.length });
  }
  return {
    succeeded,
    failed,
    pending: snapshot.slice(completed),
  };
}

const lockedAssets = new Set();
export async function withGalleryAssets(ids, action) {
  const snapshot = [...new Set(ids)];
  if (snapshot.some((id) => lockedAssets.has(id)))
    throw new Error("Uma ação já está em andamento nesta foto.");
  snapshot.forEach((id) => lockedAssets.add(id));
  try {
    return await action();
  } finally {
    snapshot.forEach((id) => lockedAssets.delete(id));
  }
}
