export const DEFAULT_ASPECT_RATIO = "4:3";

export const ASPECT_RATIO_OPTIONS = [
  { id: "4:3", label: "4:3", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 9 / 16 },
  { id: "1:1", label: "1:1", value: 1 },
];

export function getAspectRatioValue(aspectRatio) {
  return (
    ASPECT_RATIO_OPTIONS.find((option) => option.id === aspectRatio)?.value ??
    ASPECT_RATIO_OPTIONS[0].value
  );
}

export function getSensorAspectRatio(aspectRatio) {
  // Sensores fotográficos não expõem um formato quadrado dedicado. O 1:1 é
  // sempre um crop do fluxo 4:3; pedir ratio 1 aqui pode fazer a câmera
  // escolher um formato atípico e derrubar o FPS do preview.
  return aspectRatio === "16:9" ? 16 / 9 : 4 / 3;
}

export function getPreviewDimensions({
  availableHeight,
  retroStyle,
  screenWidth,
  aspectRatio,
}) {
  const ratio = getAspectRatioValue(aspectRatio);
  const maximumWidth = screenWidth * (retroStyle ? 0.9 : 1);
  const fourThreeHeight = maximumWidth / (3 / 4);
  const heightLimit =
    retroStyle && availableHeight > 0
      ? Math.min(fourThreeHeight, availableHeight)
      : fourThreeHeight;
  const width = Math.min(maximumWidth, heightLimit * ratio);

  return {
    width,
    height: width / ratio,
  };
}
