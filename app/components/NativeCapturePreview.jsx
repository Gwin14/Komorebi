import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LivePhotoCameraView } from "../../modules/camera-live-photo";
import { PortraitCameraView } from "../../modules/camera-portrait-capture";
import { ImageStackingCameraView } from "../../modules/camera-image-stacking";
import { getCachedLUT } from "../utils/lutStore";
import { getGrainConfig } from "../utils/grainCatalog";
import { getHalationConfig } from "../utils/halationCatalog";
import CameraLevel from "./CameraLevel";
import HistogramOverlay from "./HistogramOverlay";
import styles from "./CameraPreview.styles";

const EMPTY_HISTOGRAM = Array(64).fill(0);

export default function NativeCapturePreview({
  mode,
  retroStyle,
  device,
  flash,
  onCameraReady,
  gridVisible,
  levelVisible,
  histogramVisible,
  zebraHighlightsEnabled,
  zebraShadowsEnabled,
  exposure,
  verticalMode,
  doubleCaptureMode,
  smileDetectionEnabled,
  onSmileDetected,
  onStackingProgress,
  effectPreview,
  previewDoubleExposure,
  previewStacking,
}) {
  const [histogramBins, setHistogramBins] = useState(EMPTY_HISTOGRAM);
  const [previewImage, setPreviewImage] = useState(null);
  const previousHistogramBins = useRef(null);
  const NativeCameraView =
    mode === "live"
      ? LivePhotoCameraView
      : mode === "stacking"
        ? ImageStackingCameraView
        : PortraitCameraView;
  const aspectRatio = verticalMode ? 9 / 16 : 3 / 4;
  const nativeLut = useMemo(() => {
    if (!effectPreview?.lutEnabled || effectPreview.selectedLutId === "none" || !effectPreview.lutsLoaded) {
      return { size: 0, values: [], domain: [0, 0, 0, 1, 1, 1] };
    }
    const cube = getCachedLUT(effectPreview.selectedLutId);
    if (!cube?.size || cube.lut?.length !== cube.size ** 3 ||
      !cube.lut.every((color) => [color.r, color.g, color.b].every(Number.isFinite))) {
      return { size: 0, values: [], domain: [0, 0, 0, 1, 1, 1] };
    }
    return {
      size: cube.size,
      values: cube.lut.flatMap((color) => [color.r, color.g, color.b]),
      domain: [...(cube.domainMin ?? [0, 0, 0]), ...(cube.domainMax ?? [1, 1, 1])],
    };
  }, [effectPreview?.lutEnabled, effectPreview?.selectedLutId, effectPreview?.lutsLoaded]);
  const grainConfig = effectPreview?.grainEnabled
    ? getGrainConfig(effectPreview.selectedGrainId) : null;
  const halationConfig = effectPreview?.halationEnabled
    ? getHalationConfig(effectPreview.selectedHalationId) : null;
  const nativeHalation = useMemo(() => halationConfig ? [
    halationConfig.threshold,
    halationConfig.softness,
    halationConfig.contrastRadius * 0.65,
    halationConfig.minContrast,
    halationConfig.fringeRadius,
    halationConfig.targetPeakOpacity,
  ] : [], [halationConfig]);

  useEffect(() => {
    setPreviewImage(null);
  }, [device?.id, mode]);

  const handlePreviewImage = useCallback((event) => {
    const value = event?.nativeEvent ?? event;
    if (value?.type !== "doubleExposure" && value?.type !== "stacking") return;
    setPreviewImage(value.base64
      ? { type: value.type, uri: `data:image/jpeg;base64,${value.base64}` }
      : null);
  }, []);

  useEffect(() => {
    if (!device || !mode) return;

    console.log("[NativeCapturePreview] mount/update", {
      mode,
      deviceId: device.id,
      deviceName: device.name,
      flash,
      verticalMode,
      doubleCaptureMode,
    });
  }, [device, doubleCaptureMode, flash, mode, verticalMode]);

  const handleInitialized = useCallback(() => {
    console.log("[NativeCapturePreview] initialized", {
      mode,
      deviceId: device?.id,
    });
    onCameraReady?.();
  }, [device?.id, mode, onCameraReady]);

  const handleError = useCallback(
    (event) => {
      const message = event?.nativeEvent?.message;
      console.warn("[NativeCapturePreview] error", {
        mode,
        deviceId: device?.id,
        message: message || "Unknown native capture preview error",
      });
    },
    [device?.id, mode],
  );

  const handleHistogramUpdated = useCallback((event) => {
    // Paper entrega eventos de view dentro de nativeEvent; algumas versões
    // do Fabric/Expo Modules podem encaminhar o payload diretamente.
    const nextBins = event?.nativeEvent?.bins ?? event?.bins;
    if (!Array.isArray(nextBins) || nextBins.length !== 64) return;

    const previousBins = previousHistogramBins.current;
    const smoothedBins = nextBins.map((value, index) => {
      const safeValue = Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;

      return previousBins
        ? previousBins[index] * 0.42 + safeValue * 0.58
        : safeValue;
    });

    previousHistogramBins.current = smoothedBins;
    setHistogramBins(smoothedBins);
  }, []);

  if (!device || !mode) {
    return null;
  }

  return (
    <View
      style={[
        retroStyle ? styles.retroStyle : styles.cameraWrapper,
        {
          aspectRatio,
          width: verticalMode ? "75%" : retroStyle ? "90%" : "100%",
          alignSelf: "center",
          borderColor: doubleCaptureMode ? "#ffaa00" : "transparent",
          borderWidth: doubleCaptureMode ? 3 : 0,
        },
      ]}
    >
      <NativeCameraView
        style={styles.camera}
        deviceId={device.id}
        flashMode={flash === "on" ? "on" : "off"}
        isActive={true}
        onInitialized={handleInitialized}
        onError={handleError}
        smileDetectionEnabled={smileDetectionEnabled}
        onSmileDetected={onSmileDetected}
        histogramEnabled={histogramVisible}
        zebraHighlightsEnabled={zebraHighlightsEnabled}
        zebraShadowsEnabled={zebraShadowsEnabled}
        previewLutSize={nativeLut.size}
        previewLutValues={nativeLut.values}
        previewLutDomain={nativeLut.domain}
        previewGrainStrength={grainConfig ? grainConfig.lumaStrength * 2 / 255 : 0}
        previewHalation={nativeHalation}
        {...(mode === "stacking" ? { previewDoubleExposure, previewStacking } : {})}
        {...(mode === "stacking" ? { exposureBias: exposure } : {})}
        onHistogramUpdated={
          histogramVisible ? handleHistogramUpdated : undefined
        }
        onStackingProgress={
          mode === "stacking" ? onStackingProgress : undefined
        }
        onPreviewImage={mode === "stacking" ? handlePreviewImage : undefined}
      />

      {mode === "stacking" && previewImage && (
        (previewImage.type === "doubleExposure" && previewDoubleExposure) ||
        (previewImage.type === "stacking" && previewStacking)
      ) && (
        <Image
          pointerEvents="none"
          source={{ uri: previewImage.uri }}
          resizeMode="cover"
          onError={(event) => console.warn("[ImageStacking] preview decode failed", event.nativeEvent?.error)}
          style={[StyleSheet.absoluteFill, {
            opacity: previewImage.type === "doubleExposure" ? 0.5 : 1,
          }]}
        />
      )}

      {gridVisible && (
        <View pointerEvents="none" style={styles.gridOverlay}>
          <View style={[styles.gridLineVertical, { left: "33.333%" }]} />
          <View style={[styles.gridLineVertical, { left: "66.666%" }]} />

          <View style={[styles.gridLineHorizontal, { top: "33.333%" }]} />
          <View style={[styles.gridLineHorizontal, { top: "66.666%" }]} />
        </View>
      )}

      {levelVisible && <CameraLevel />}

      {histogramVisible && <HistogramOverlay bins={histogramBins} />}

      {doubleCaptureMode &&
        (() => {
          const marginPct = `${(((1 - aspectRatio * aspectRatio) / 2) * 100).toFixed(4)}%`;
          return (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.doubleCropZone, { height: marginPct }]}>
                <View style={styles.doubleCropBorder} />
              </View>
              <View
                style={[
                  styles.doubleCropZone,
                  styles.doubleCropZoneBottom,
                  { height: marginPct },
                ]}
              >
                <View
                  style={[
                    styles.doubleCropBorder,
                    { top: 0, bottom: undefined },
                  ]}
                />
              </View>
            </View>
          );
        })()}
    </View>
  );
}
