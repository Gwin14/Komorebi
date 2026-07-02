import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useCameraFormat } from "react-native-vision-camera";
import { Camera } from "react-native-vision-camera-face-detector";
import styles from "./CameraPreview.styles";

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
  setMinZoom,
  setMaxZoom,
  onSmileDetected,
  smileDetectionEnabled,
  location,
  verticalMode,
  doubleCaptureMode,
  isActive = true,
  manualPhotoMode = false,
  onFocusAtPoint,
}) {
  const isTakingPhoto = useRef(false);
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });

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
  const format = useCameraFormat(device, [
    { photoAspectRatio: verticalMode ? 16 / 9 : 4 / 3 },
    ...(manualPhotoMode ? [] : [{ photoResolution: "max" }]),
    { videoResolution: "max" },
  ]);

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
        <Camera
          style={styles.camera}
          device={device}
          isActive={isActive}
          ref={cameraRef}
          format={format}
          photo={true}
          video={false}
          audio={false}
          zoom={zoom}
          exposure={exposure}
          onInitialized={onCameraReady}
          faceDetectionCallback={handleFacesDetection}
          faceDetectionOptions={faceDetectionOptions}
          enableLocation={location}
          photoQualityBalance={"balanced"}
        />
        {gridVisible && (
          <View pointerEvents="none" style={styles.gridOverlay}>
            <View style={[styles.gridLineVertical, { left: "33.333%" }]} />
            <View style={[styles.gridLineVertical, { left: "66.666%" }]} />

            <View style={[styles.gridLineHorizontal, { top: "33.333%" }]} />
            <View style={[styles.gridLineHorizontal, { top: "66.666%" }]} />
          </View>
        )}

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
