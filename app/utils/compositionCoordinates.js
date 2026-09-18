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
  const inversePoint = ({ x, y }) => {
    x = (x * preview.width - offsetX) / (width * scale);
    y = (y * preview.height - offsetY) / (height * scale);
    if (mirror) x = 1 - x;
    if (rotation === 90) [x, y] = [y, 1 - x];
    else if (rotation === 180) [x, y] = [1 - x, 1 - y];
    else if (rotation === 270) [x, y] = [1 - y, x];
    return { x, y };
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
  return { point, inversePoint, rect };
}

function applyHomography(point, matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 9) return null;
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
  const denominator = m20 * point.x + m21 * point.y + m22;
  if (![...matrix, denominator].every(Number.isFinite) || Math.abs(denominator) < 1e-6) return null;
  const next = {
    x: (m00 * point.x + m01 * point.y + m02) / denominator,
    y: (m10 * point.x + m11 * point.y + m12) / denominator,
  };
  return Number.isFinite(next.x) && Number.isFinite(next.y) ? next : null;
}

const framingPoints = (rect) => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

export function transformCompositionGizmo(gizmo, geometry, preview, matrix) {
  if (gizmo.type !== "framing" || gizmo.anchor !== "scene") return gizmo;
  const transform = createCompositionTransform(geometry, preview);
  const move = (point) => {
    const source = transform.inversePoint(point);
    // Vision's registration matrix uses a bottom-left image origin, while
    // analysis rectangles and the React Native overlay use top-left. Convert
    // into Vision space before applying the matrix and flip back afterwards.
    const tracked = applyHomography({ x: source.x, y: 1 - source.y }, matrix);
    return tracked ? transform.point({ x: tracked.x, y: 1 - tracked.y }) : null;
  };
  const originalCenter = {
    x: gizmo.rect.x + gizmo.rect.width / 2,
    y: gizmo.rect.y + gizmo.rect.height / 2,
  };
  const trackedCenter = move(originalCenter);
  const trackedCorners = framingPoints(gizmo.rect).map(move);
  if (!trackedCenter || !trackedCorners.every(Boolean)) return null;

  const left = Math.min(...trackedCorners.map((point) => point.x));
  const right = Math.max(...trackedCorners.map((point) => point.x));
  const top = Math.min(...trackedCorners.map((point) => point.y));
  const bottom = Math.max(...trackedCorners.map((point) => point.y));
  // Homography can introduce perspective. Use it only as a center/scale
  // signal, then rebuild an axis-aligned preview-shaped rectangle.
  const size = Math.max(0.02, Math.sqrt(Math.max(0, (right - left) * (bottom - top))));
  return {
    ...gizmo,
    rect: {
      x: trackedCenter.x - size / 2,
      y: trackedCenter.y - size / 2,
      width: size,
      height: size,
    },
  };
}

export function applyCompositionTracking(result, geometry, preview, tracking) {
  if (!result || tracking?.lost) return null;
  if (!geometry || !tracking?.matrix) return result;
  const framing = result.gizmos.find((gizmo) => gizmo.type === "framing");
  if (!framing) return null;
  const transformed = transformCompositionGizmo(framing, geometry, preview, tracking.matrix);
  return transformed ? { ...result, gizmos: [transformed] } : null;
}

export function getFramingAlignment(result, preview) {
  const framing = result?.gizmos?.find((gizmo) => gizmo.type === "framing");
  if (!framing || !(preview.width > 0 && preview.height > 0)) return null;
  const centerX = framing.rect.x + framing.rect.width / 2;
  const centerY = framing.rect.y + framing.rect.height / 2;
  const deltaX = (centerX - 0.5) * preview.width;
  const deltaY = (centerY - 0.5) * preview.height;
  const distance = Math.hypot(deltaX, deltaY);
  const tolerance = Math.min(preview.width, preview.height) * 0.04;
  return { aligned: distance <= tolerance, distance, tolerance, framing };
}

export function advanceAlignmentGate(previousCount, aligned, requiredUpdates = 3) {
  const count = aligned ? previousCount + 1 : 0;
  return { count, triggered: count >= requiredUpdates };
}

export function calculateFramingZoom(rect, currentZoom, minZoom, maxZoom) {
  if (!rect || ![rect.width, rect.height, currentZoom, minZoom, maxZoom].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0) return currentZoom;
  const scale = Math.min(1 / rect.width, 1 / rect.height);
  return Math.min(maxZoom, Math.max(minZoom, currentZoom * scale));
}
