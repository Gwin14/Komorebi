import { Image, StyleSheet, View } from "react-native";
import { Camera, useCameraDevice } from "react-native-vision-camera";

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
}) {
  const device = useCameraDevice(facing === "back" ? "back" : "front");

  if (!device) {
    return null;
  }

  // Atualiza limites reais de zoom do device
  if (setMinZoom && setMaxZoom) {
    setMinZoom(device.minZoom);
    setMaxZoom(device.maxZoom);
  }

  return (
    <View style={retroStyle ? styles.retroStyle : styles.cameraWrapper}>
      <Camera
        style={styles.camera}
        device={device}
        isActive={true}
        ref={cameraRef}
        photo={true}
        video={false}
        audio={false}
        zoom={zoom}
        onInitialized={onCameraReady}
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
