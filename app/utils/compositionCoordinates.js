// All scene observations use normalized, top-left image coordinates.
// rotation is clockwise from the analyzed image to the preview; native v1
// returns upright device pixels. Mirroring is applied exactly once.
export function createCompositionTransform(geometry, preview) {
  const rotation = ((geometry.rotation ?? 0) % 360 + 360) % 360;
  const swapped = rotation === 90 || rotation === 270;
  const width = swapped ? geometry.height : geometry.width;
  const height = swapped ? geometry.width : geometry.height;
  if (!(width > 0 && height > 0 && preview.width > 0 && preview.height > 0)) {
    throw new Error("Invalid composition geometry");
  }
  const scale = Math.max(preview.width / width, preview.height / height);
  const offsetX = (preview.width - width * scale) / 2;
  const offsetY = (preview.height - height * scale) / 2;
  const mirror = Boolean(preview.mirrored) !== Boolean(geometry.mirrored);
  const point = ({ x, y }) => {
    if (rotation === 90) [x, y] = [1 - y, x];
    else if (rotation === 180) [x, y] = [1 - x, 1 - y];
    else if (rotation === 270) [x, y] = [y, 1 - x];
    if (mirror) x = 1 - x;
    return {
      x: (x * width * scale + offsetX) / preview.width,
      y: (y * height * scale + offsetY) / preview.height,
    };
  };
  const rect = (box) => {
    const corners = [
      point(box), point({ x: box.x + box.width, y: box.y }),
      point({ x: box.x, y: box.y + box.height }),
      point({ x: box.x + box.width, y: box.y + box.height }),
    ];
    const left = Math.max(0, Math.min(...corners.map((p) => p.x)));
    const top = Math.max(0, Math.min(...corners.map((p) => p.y)));
    const right = Math.min(1, Math.max(...corners.map((p) => p.x)));
    const bottom = Math.min(1, Math.max(...corners.map((p) => p.y)));
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  return { point, rect, angle: (radians) => (mirror ? -1 : 1) * (radians + rotation * Math.PI / 180) };
}
