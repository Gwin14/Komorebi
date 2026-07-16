import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LivePhotoCameraView } from "../../modules/camera-live-photo";
import { PortraitCameraView } from "../../modules/camera-portrait-capture";
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
  verticalMode,
  doubleCaptureMode,
  smileDetectionEnabled,
  onSmileDetected,
}) {
  const [histogramBins, setHistogramBins] = useState(EMPTY_HISTOGRAM);
  const previousHistogramBins = useRef(null);
  const NativeCameraView =
    mode === "live" ? LivePhotoCameraView : PortraitCameraView;
  const aspectRatio = verticalMode ? 9 / 16 : 3 / 4;

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

  const handleError = useCallback((event) => {
    const message = event?.nativeEvent?.message;
    console.warn("[NativeCapturePreview] error", {
      mode,
      deviceId: device?.id,
      message: message || "Unknown native capture preview error",
    });
  }, [device?.id, mode]);

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
        onHistogramUpdated={
          histogramVisible ? handleHistogramUpdated : undefined
        }
      />

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
