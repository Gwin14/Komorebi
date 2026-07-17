import { BlurView } from "expo-blur";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useCameraFormat } from "react-native-vision-camera";
import { Camera as FaceDetectionCamera } from "react-native-vision-camera-face-detector";
import CameraLevel from "./CameraLevel";
import HistogramOverlay from "./HistogramOverlay";
import styles from "./CameraPreview.styles";

const EMPTY_HISTOGRAM = Array(64).fill(0);

export default function CameraPreview({
  retroStyle,
  cameraRef,
  device,
  flash,
  zoom,
  exposure,
  pictureSize,
  onCameraReady,
  gridVisible,
  levelVisible,
  histogramVisible,
  setMinZoom,
  setMaxZoom,
  onSmileDetected,
  smileDetectionEnabled,
  location,
  verticalMode,
  doubleCaptureMode,
  isActive = true,
  manualPhotoMode = false,
  rawPhotoMode = false,
  onFocusAtPoint,
}) {
  const isTakingPhoto = useRef(false);
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });
  const [histogramBins, setHistogramBins] = useState(EMPTY_HISTOGRAM);
  const previousHistogramBins = useRef(null);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const transitionOpacity = useRef(new Animated.Value(0)).current;
  const cameraScale = useRef(new Animated.Value(1)).current;
  const hasCameraDevice = Boolean(device);
  const cameraConfigKey = `${device?.id ?? "none"}:${rawPhotoMode ? "raw" : "standard"}:${verticalMode ? "vertical" : "horizontal"}`;
  const previousCameraConfigKey = useRef(cameraConfigKey);
  const transitionFallbackTimeout = useRef(null);
  const transitionFinishTimeout = useRef(null);
  const transitionStartedAt = useRef(0);

  // Toque para focar
  const [focusPoint, setFocusPoint] = useState(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const focusOnPoint = useCallback(
    (x, y) => {
      if (!device?.supportsFocus) return;

      setFocusPoint({ x, y });
      focusAnim.stopAnimation();
      focusAnim.setValue(1);
      Animated.timing(focusAnim, {
        toValue: 0,
        duration: 600,
        delay: 500,
        useNativeDriver: true,
      }).start();

      const { width, height } = previewLayout;
      if (onFocusAtPoint && width > 0 && height > 0) {
        // AVCaptureDevice point-of-interest coordinates are rotated relative
        // to the portrait preview layer coordinates used by the tap gesture.
        const pointX = Math.max(0, Math.min(1, y / height));
        const pointY = Math.max(0, Math.min(1, 1 - x / width));

        onFocusAtPoint(pointX, pointY).then((handled) => {
          if (!handled) cameraRef.current?.focus({ x, y }).catch(() => {});
        });
        return;
      }

      cameraRef.current?.focus({ x, y }).catch(() => {});
    },
    [device, cameraRef, focusAnim, onFocusAtPoint, previewLayout],
  );

  const focusGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .onEnd((event) => {
          runOnJS(focusOnPoint)(event.x, event.y);
        }),
    [focusOnPoint],
  );

  // Em modo manual, evita resolução máxima de foto: nos sensores Quad-Bayer
  // (ex: iPhone 17 Pro 48MP) a captura em full-res usa um pipeline de
  // leitura/binning próprio com sua própria exposição, que ignora o ISO/
  // obturador travado no AVCaptureDevice — só a captura "binned" (resolução
  // normal) respeita o lock manual de forma confiável.
  const formatFilters = useMemo(
    () => [
      // RAW precisa permanecer em um formato de sensor 4:3. O 9:16 é um
      // enquadramento/crop derivado; selecionar 3840x2160 elimina rawFormats.
      { photoAspectRatio: rawPhotoMode ? 4 / 3 : verticalMode ? 16 / 9 : 4 / 3 },
      ...(manualPhotoMode ? [] : [{ photoResolution: "max" }]),
      { videoResolution: "max" },
    ],
    [manualPhotoMode, rawPhotoMode, verticalMode],
  );
  const format = useCameraFormat(device, formatFilters);

  const handleFacesDetection = useCallback(
    (faces) => {
      if (!smileDetectionEnabled) return;
      if (!faces.length || isTakingPhoto.current) return;

      const face = faces[0];

      if (
        face.smilingProbability !== undefined &&
        face.smilingProbability > 0.7
      ) {
        isTakingPhoto.current = true;
        onSmileDetected?.();
        setTimeout(() => {
          isTakingPhoto.current = false;
        }, 2500);
      }
    },
    [onSmileDetected, smileDetectionEnabled],
  );

  const faceDetectionOptions = useMemo(
    () => ({
      performanceMode: "accurate",
      classificationMode: "all",
      landmarkMode: "all",
    }),
    [],
  );

  const handleHistogramUpdate = useCallback((nextBins) => {
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

  const finishCameraTransition = useCallback(() => {
    if (transitionFallbackTimeout.current) {
      clearTimeout(transitionFallbackTimeout.current);
      transitionFallbackTimeout.current = null;
    }

    if (transitionFinishTimeout.current) {
      clearTimeout(transitionFinishTimeout.current);
    }

    const elapsed = Date.now() - transitionStartedAt.current;
    const delay = Math.max(0, 280 - elapsed);

    transitionFinishTimeout.current = setTimeout(() => {
      transitionFinishTimeout.current = null;

      Animated.parallel([
        Animated.timing(transitionOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.spring(cameraScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          mass: 0.65,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setTransitionVisible(false);
      });
    }, delay);
  }, [cameraScale, transitionOpacity]);

  const handleCameraInitialized = useCallback(() => {
    onCameraReady?.();
    finishCameraTransition();
  }, [finishCameraTransition, onCameraReady]);

  useEffect(() => {
    if (!hasCameraDevice) return undefined;
    if (previousCameraConfigKey.current === cameraConfigKey) {
      return undefined;
    }

    previousCameraConfigKey.current = cameraConfigKey;
    transitionStartedAt.current = Date.now();
    setTransitionVisible(true);
    transitionOpacity.stopAnimation();
    cameraScale.stopAnimation();
    transitionOpacity.setValue(1);
    cameraScale.setValue(1.012);

    transitionFallbackTimeout.current = setTimeout(
      finishCameraTransition,
      1100,
    );

    return () => {
      if (transitionFallbackTimeout.current) {
        clearTimeout(transitionFallbackTimeout.current);
        transitionFallbackTimeout.current = null;
      }
      if (transitionFinishTimeout.current) {
        clearTimeout(transitionFinishTimeout.current);
        transitionFinishTimeout.current = null;
      }
    };
  }, [
    cameraConfigKey,
    cameraScale,
    finishCameraTransition,
    hasCameraDevice,
    transitionOpacity,
  ]);

  useEffect(() => {
    if (!device) return;

    if (setMinZoom) setMinZoom(device.minZoom);
    if (setMaxZoom) setMaxZoom(device.maxZoom);

    console.log("=== CÂMERA INICIALIZADA ===");
    console.log("Nome:", device.name);
    console.log("Position:", device.position);
    console.log("physicalDevices:", device.physicalDevices);
    console.log("minZoom:", device.minZoom);
    console.log("maxZoom:", device.maxZoom);
    console.log("neutralZoom:", device.neutralZoom);
    console.log("minExposure:", device.minExposure);
    console.log("maxExposure:", device.maxExposure);
    console.log("==========================");

    // Alert.alert(
    //   "Câmera selecionada",
    //   `Nome: ${device.name}\n\nphysicalDevices: ${JSON.stringify(
    //     device.physicalDevices,
    //   )}\n\nminZoom: ${device.minZoom}\nmaxZoom: ${device.maxZoom}`,
    // );
  }, [device, setMinZoom, setMaxZoom]);

  if (!device) {
    return null;
  }

  const aspectRatio = verticalMode ? 9 / 16 : 3 / 4;
  // O frame processor do detector pode coexistir com o photo output RAW.
  // Manter o mesmo componente evita perder o disparo por sorriso em RAW.
  const CameraComponent = FaceDetectionCamera;
  const faceDetectionProps = {
    faceDetectionCallback: handleFacesDetection,
    faceDetectionOptions,
  };

  return (
    <GestureDetector gesture={focusGesture}>
      <View
        onLayout={(event) => setPreviewLayout(event.nativeEvent.layout)}
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
        <Animated.View
          style={[
            styles.camera,
            {
              transform: [{ scale: cameraScale }],
            },
          ]}
        >
          <CameraComponent
            style={styles.camera}
            device={device}
            isActive={isActive}
            ref={cameraRef}
            format={format}
            photo={true}
            video={false}
            audio={false}
            outputOrientation="device"
            zoom={zoom}
            exposure={exposure}
            onInitialized={handleCameraInitialized}
            histogramCallback={
              histogramVisible ? handleHistogramUpdate : undefined
            }
            {...faceDetectionProps}
            enableLocation={location}
            photoQualityBalance={rawPhotoMode ? "quality" : "balanced"}
          />
        </Animated.View>
        {transitionVisible && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cameraTransitionOverlay,
              { opacity: transitionOpacity },
            ]}
          >
            <BlurView
              intensity={42}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.cameraTransitionScrim} />
          </Animated.View>
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

        {focusPoint && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusSquare,
              {
                left: focusPoint.x,
                top: focusPoint.y,
                opacity: focusAnim,
                transform: [
                  {
                    scale: focusAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1.3, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
      </View>
    </GestureDetector>
  );
}
