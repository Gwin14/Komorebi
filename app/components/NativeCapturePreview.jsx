import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LivePhotoCameraView } from "../../modules/camera-live-photo";
import { PortraitCameraView } from "../../modules/camera-portrait-capture";
import styles from "./CameraPreview.styles";

export default function NativeCapturePreview({
  mode,
  retroStyle,
  device,
  flash,
  onCameraReady,
  gridVisible,
  verticalMode,
  doubleCaptureMode,
}) {
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
    </View>
  );
}
