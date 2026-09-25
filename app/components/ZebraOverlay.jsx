import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";

function orientPoint(x, y, width, height, orientation) {
  switch (orientation) {
    case "landscape-right":
      return { x: height - y, y: x, width: height, height: width };
    case "landscape-left":
      return { x: y, y: width - x, width: height, height: width };
    case "portrait-upside-down":
      return { x: width - x, y: height - y, width, height };
    default:
      return { x, y, width, height };
  }
}

function makeMaskPaths(mask, viewWidth, viewHeight) {
  const highlights = Skia.Path.Make();
  const shadows = Skia.Path.Make();
  if (!mask || viewWidth <= 0 || viewHeight <= 0) {
    return { highlights, shadows };
  }

  const { columns, rows, values, frameWidth, frameHeight, orientation, mirrored } = mask;
  if (!columns || !rows || !Array.isArray(values) || !frameWidth || !frameHeight) {
    return { highlights, shadows };
  }

  const sample = orientPoint(0, 0, frameWidth, frameHeight, orientation);
  const displayWidth = sample.width;
  const displayHeight = sample.height;
  const scale = Math.max(viewWidth / displayWidth, viewHeight / displayHeight);
  const offsetX = (viewWidth - displayWidth * scale) / 2;
  const offsetY = (viewHeight - displayHeight * scale) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column];
      if (value !== 1 && value !== 2) continue;

      const x0 = (column / columns) * frameWidth;
      const x1 = ((column + 1) / columns) * frameWidth;
      const y0 = (row / rows) * frameHeight;
      const y1 = ((row + 1) / rows) * frameHeight;
      const corners = [
        orientPoint(x0, y0, frameWidth, frameHeight, orientation),
        orientPoint(x1, y0, frameWidth, frameHeight, orientation),
        orientPoint(x0, y1, frameWidth, frameHeight, orientation),
        orientPoint(x1, y1, frameWidth, frameHeight, orientation),
      ];
      const xs = corners.map((point) => mirrored ? displayWidth - point.x : point.x);
      const ys = corners.map((point) => point.y);
      const left = Math.min(...xs) * scale + offsetX;
      const top = Math.min(...ys) * scale + offsetY;
      const right = Math.max(...xs) * scale + offsetX;
      const bottom = Math.max(...ys) * scale + offsetY;
      const path = value === 1 ? highlights : shadows;
      path.addRect(Skia.XYWHRect(left, top, right - left + 0.5, bottom - top + 0.5));
    }
  }
  return { highlights, shadows };
}

function makeStripePath(width, height) {
  const path = Skia.Path.Make();
  for (let x = -height; x < width + height; x += 12) {
    path.moveTo(x, height);
    path.lineTo(x + height, 0);
  }
  return path;
}

export default function ZebraOverlay({ mask, width, height }) {
  const paths = useMemo(
    () => makeMaskPaths(mask, width, height),
    [height, mask, width],
  );
  const stripes = useMemo(() => makeStripePath(width, height), [height, width]);

  if (!mask || width <= 0 || height <= 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group clip={paths.highlights}>
          <Path path={stripes} color="rgba(255, 20, 20, 0.88)" style="stroke" strokeWidth={5} />
        </Group>
        <Group clip={paths.shadows}>
          <Path path={stripes} color="rgba(20, 82, 255, 0.9)" style="stroke" strokeWidth={5} />
        </Group>
      </Canvas>
    </View>
  );
}
