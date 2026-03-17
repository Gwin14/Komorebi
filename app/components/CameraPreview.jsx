import { useCallback, useEffect, useMemo, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useCameraDevice, useCameraFormat } from "react-native-vision-camera";
import { Camera } from "react-native-vision-camera-face-detector";
// import { Dimensions } from "react-native";

// const { width, height } = Dimensions.get("screen");

export default function CameraPreview({
  retroStyle,
  cameraRef,
  facing,
  flash,
  zoom,
  pictureSize,
  onCameraReady,
  gridVisible,
  setMinZoom,
  setMaxZoom,
  onSmileDetected,
  smileDetectionEnabled,
  location,
}) {
  const device = useCameraDevice(facing === "back" ? "back" : "front");
  const isTakingPhoto = useRef(false);

  const format = useCameraFormat(device, [
    { photoAspectRatio: 4 / 3 },
    { photoResolution: "max" },
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
    if (device && setMinZoom && setMaxZoom) {
      setMinZoom(device.minZoom);
      setMaxZoom(device.maxZoom);
    }
  }, [device, setMinZoom, setMaxZoom]);

  if (!device) {
    return null;
  }

  return (
    <View style={retroStyle ? styles.retroStyle : styles.cameraWrapper}>
      <Camera
        style={styles.camera}
        device={device}
        isActive={true}
        ref={cameraRef}
        format={format}
        photo={true}
        video={false}
        audio={false}
        zoom={zoom}
        onInitialized={onCameraReady}
        faceDetectionCallback={handleFacesDetection}
        faceDetectionOptions={faceDetectionOptions}
        enableLocation={location}
        photoQualityBalance={"quality"}
      />
      <Image
        source={require("../../assets/images/grid.png")}
        style={gridVisible ? styles.grid : styles.gridHidden}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrapper: {
    position: "absolute",
    top: 120,
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
  },
  retroStyle: {
    position: "absolute",
    alignSelf: "center",
    top: 130,
    width: "90%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
    borderRadius: 10,
  },
  camera: { flex: 1 },
  grid: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    resizeMode: "stretch",
    tintColor: "#7b7b7b3c",
  },
  gridHidden: { display: "none" },
});
