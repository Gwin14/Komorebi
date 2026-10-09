import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { LivePhotoCameraView } from "../../modules/camera-live-photo";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
  PortraitCameraView,
  focusPortraitCamera,
} from "../../modules/camera-portrait-capture";
import { ImageStackingCameraView } from "../../modules/camera-image-stacking";
import { getCachedLUT } from "../utils/lutStore";
import { getGrainConfig } from "../utils/grainCatalog";
import { getHalationConfig } from "../utils/halationCatalog";
import { portraitPreviewFocusPoint } from "../utils/portraitPreview";
import {
  getAspectRatioValue,
  getPreviewDimensions,
} from "../utils/aspectRatios";
import CameraLevel from "./CameraLevel";
import HistogramOverlay from "./HistogramOverlay";
import styles from "./CameraPreview.styles";

const EMPTY_HISTOGRAM = Array(64).fill(0);

export default function NativeCapturePreview({
  mode,
  isActive = true,
  retroStyle,
  device,
  zoomFactor = 1,
  flash,
  onCameraReady,
  gridVisible,
  levelVisible,
  histogramVisible,
  zebraHighlightsEnabled,
  zebraShadowsEnabled,
  exposure,
  aspectRatio,
  availableHeight = 0,
  doubleCaptureMode,
  smileDetectionEnabled,
  onSmileDetected,
  onStackingProgress,
  effectPreview,
  previewDoubleExposure,
  previewStacking,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const [histogramBins, setHistogramBins] = useState(EMPTY_HISTOGRAM);
  const [previewImage, setPreviewImage] = useState(null);
  const previousHistogramBins = useRef(null);
  const NativeCameraView =
    mode === "live"
      ? LivePhotoCameraView
      : mode === "stacking"
        ? ImageStackingCameraView
        : PortraitCameraView;
  const aspectRatioValue = getAspectRatioValue(aspectRatio);
  const previewDimensions = getPreviewDimensions({
    availableHeight,
    retroStyle,
    screenWidth,
    aspectRatio,
  });
  // Os módulos nativos mantêm uma superfície 4:3 estável. As outras
  // proporções são janelas de crop, evitando relayout do preview a cada frame.
  const nativeSurfaceDimensions = getPreviewDimensions({
    availableHeight,
    retroStyle,
    screenWidth,
    aspectRatio: "4:3",
  });
  const nativeSurfaceStyle = {
    position: "absolute",
    width: nativeSurfaceDimensions.width,
    height: nativeSurfaceDimensions.height,
    left: (previewDimensions.width - nativeSurfaceDimensions.width) / 2,
    top: (previewDimensions.height - nativeSurfaceDimensions.height) / 2,
  };
  const nativeLut = useMemo(() => {
    if (
      !effectPreview?.lutEnabled ||
      effectPreview.selectedLutId === "none" ||
      !effectPreview.lutsLoaded
    ) {
      return { size: 0, values: [], domain: [0, 0, 0, 1, 1, 1] };
    }
    const cube = getCachedLUT(effectPreview.selectedLutId);
    if (
      !cube?.size ||
      cube.lut?.length !== cube.size ** 3 ||
      !cube.lut.every((color) =>
        [color.r, color.g, color.b].every(Number.isFinite),
      )
    ) {
      return { size: 0, values: [], domain: [0, 0, 0, 1, 1, 1] };
    }
    return {
      size: cube.size,
      values: cube.lut.flatMap((color) => [color.r, color.g, color.b]),
      domain: [
        ...(cube.domainMin ?? [0, 0, 0]),
        ...(cube.domainMax ?? [1, 1, 1]),
      ],
    };
  }, [
    effectPreview?.lutEnabled,
    effectPreview?.selectedLutId,
    effectPreview?.lutsLoaded,
  ]);
  const grainConfig = effectPreview?.grainEnabled
    ? getGrainConfig(effectPreview.selectedGrainId)
    : null;
  const halationConfig = effectPreview?.halationEnabled
    ? getHalationConfig(effectPreview.selectedHalationId)
    : null;
  const nativeHalation = useMemo(
    () =>
      halationConfig
        ? [
            halationConfig.threshold,
            halationConfig.softness,
            halationConfig.contrastRadius * 0.65,
            halationConfig.minContrast,
            halationConfig.fringeRadius,
            halationConfig.targetPeakOpacity,
          ]
        : [],
    [halationConfig],
  );

  useEffect(() => {
    setPreviewImage(null);
  }, [device?.id, mode]);

  const handlePreviewImage = useCallback((event) => {
    const value = event?.nativeEvent ?? event;
    if (value?.type !== "doubleExposure" && value?.type !== "stacking") return;
    setPreviewImage(
      value.base64
        ? { type: value.type, uri: `data:image/jpeg;base64,${value.base64}` }
        : null,
    );
  }, []);

  useEffect(() => {
    if (!device || !mode) return;

    console.log("[NativeCapturePreview] mount/update", {
      mode,
      deviceId: device.id,
      deviceName: device.name,
      flash,
      aspectRatio,
      doubleCaptureMode,
    });
  }, [aspectRatio, device, doubleCaptureMode, flash, mode]);

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

  const [focusPoint, setFocusPoint] = useState(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const focusRequest = useRef(0);
  const focusOnPoint = useCallback(async (x, y) => {
    if (mode !== "portrait" || !isActive || !device?.id) return;
    const point = portraitPreviewFocusPoint({ x, y }, {
      width: nativeSurfaceDimensions.width,
      height: nativeSurfaceDimensions.height,
      left: nativeSurfaceStyle.left,
      top: nativeSurfaceStyle.top,
    });
    if (!point) return;
    const request = ++focusRequest.current;
    try {
      const focused = await focusPortraitCamera({ deviceId: device.id, ...point });
      if (!focused || focusRequest.current !== request) return;
      setFocusPoint({ x, y });
      focusAnim.stopAnimation();
      focusAnim.setValue(1);
      Animated.timing(focusAnim, {
        toValue: 0, duration: 600, delay: 500, useNativeDriver: true,
      }).start();
    } catch (error) {
      console.warn("[NativeCapturePreview] portrait focus failed", error);
    }
  }, [device?.id, focusAnim, isActive, mode, nativeSurfaceDimensions.width,
    nativeSurfaceDimensions.height, nativeSurfaceStyle.left, nativeSurfaceStyle.top]);
  const focusGesture = useMemo(() => Gesture.Tap()
    .enabled(mode === "portrait" && isActive)
    .maxDuration(250)
    .onEnd((event, success) => {
      if (success) runOnJS(focusOnPoint)(event.x, event.y);
    }), [focusOnPoint, isActive, mode]);
  useEffect(() => {
    focusRequest.current += 1;
    setFocusPoint(null);
    focusAnim.stopAnimation();
    return () => {
      focusRequest.current += 1;
      focusAnim.stopAnimation();
    };
  }, [device?.id, focusAnim, isActive, mode]);

  if (!device || !mode) {
    return null;
  }

  return (
    <GestureDetector gesture={focusGesture}>
      <View
        style={[
          retroStyle ? styles.retroStyle : styles.cameraWrapper,
          {
            width: previewDimensions.width,
            height: previewDimensions.height,
            alignSelf: "center",
            borderColor: doubleCaptureMode ? "#ffaa00" : "transparent",
            borderWidth: doubleCaptureMode ? 3 : 0,
          },
        ]}
      >
        <NativeCameraView
          style={nativeSurfaceStyle}
          deviceId={device.id}
          zoomFactor={zoomFactor}
          flashMode={flash === "on" ? "on" : "off"}
          isActive={isActive}
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
          previewGrainStrength={
            grainConfig ? (grainConfig.lumaStrength * 2) / 255 : 0
          }
          previewHalation={nativeHalation}
          {...(mode === "stacking"
            ? { previewDoubleExposure, previewStacking }
            : {})}
          {...(mode === "stacking" || mode === "portrait"
            ? { exposureBias: exposure }
            : {})}
          onHistogramUpdated={
            histogramVisible ? handleHistogramUpdated : undefined
          }
          onStackingProgress={
            mode === "stacking" ? onStackingProgress : undefined
          }
          onPreviewImage={mode === "stacking" ? handlePreviewImage : undefined}
        />

        {mode === "stacking" &&
          previewImage &&
          ((previewImage.type === "doubleExposure" && previewDoubleExposure) ||
            (previewImage.type === "stacking" && previewStacking)) && (
            <Image
              pointerEvents="none"
              source={{ uri: previewImage.uri }}
              resizeMode="cover"
              onError={(event) =>
                console.warn(
                  "[ImageStacking] preview decode failed",
                  event.nativeEvent?.error,
                )
              }
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: previewImage.type === "doubleExposure" ? 0.5 : 1,
                },
              ]}
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
            const marginPct = `${(((1 - aspectRatioValue * aspectRatioValue) / 2) * 100).toFixed(4)}%`;
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
        {mode === "portrait" && focusPoint && (
          <Animated.View pointerEvents="none" style={[
            styles.focusSquare,
            { left: focusPoint.x, top: focusPoint.y, opacity: focusAnim },
          ]} />
        )}
      </View>
    </GestureDetector>
  );
}
