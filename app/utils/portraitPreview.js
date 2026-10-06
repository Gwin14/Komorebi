// The visible preview is a centered crop of the native 4:3 camera surface.
// Send coordinates in that surface so AVFoundation can account for rotation,
// aspect-fill scaling and front-camera mirroring.
export function portraitPreviewFocusPoint(point, surface) {
  if (
    !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    !Number.isFinite(surface.width) || !Number.isFinite(surface.height) ||
    !Number.isFinite(surface.left) || !Number.isFinite(surface.top) ||
    surface.width <= 0 || surface.height <= 0
  ) return null;

  return {
    x: Math.max(0, Math.min(1, (point.x - surface.left) / surface.width)),
    y: Math.max(0, Math.min(1, (point.y - surface.top) / surface.height)),
  };
}
