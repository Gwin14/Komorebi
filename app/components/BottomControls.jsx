import { Ionicons } from "@expo/vector-icons";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import ExposureDialFinal from "./ExposureDialFinal";
import LUTSelector from "./LUTSelector";
import Shutter from "./shutter";

export default function BottomControls({
  controlsAnim,
  activeControl,
  takePicture,
  setFacing,
  zoom,
  setZoom,
  selectedLutId,
  setSelectedLutId,
}) {
  const shutterTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  const toolsTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const toolsOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const shutterOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.shutterContainer}>
      <Animated.View
        style={[
          styles.shutterRow,
          {
            transform: [{ translateY: shutterTranslate }],
            opacity: shutterOpacity,
          },
        ]}
      >
        <TouchableOpacity style={styles.sideButton}>
          <Ionicons name="images-outline" size={32} color="white" />
        </TouchableOpacity>

        <View pointerEvents={activeControl === "none" ? "auto" : "none"}>
          <Shutter takePicture={takePicture} />
        </View>

        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
        >
          <Ionicons name="camera-reverse-outline" size={32} color="white" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.toolsContainer,
          {
            transform: [{ translateY: toolsTranslate }],
            opacity: toolsOpacity,
          },
        ]}
        pointerEvents={activeControl !== "none" ? "auto" : "none"}
      >
        {activeControl === "zoom" && (
          <ExposureDialFinal value={zoom} onChange={(v) => setZoom(v)} />
        )}

        {activeControl === "lut" && (
          <View style={styles.lutSelectorWrapper}>
            <LUTSelector
              selectedLutId={selectedLutId}
              onSelectLut={setSelectedLutId}
              visible={true}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shutterContainer: {
    position: "absolute",
    bottom: 64,
    width: "100%",
    alignItems: "center",
    height: 100,
  },
  shutterRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    position: "absolute",
    bottom: 0,
    height: "100%",
  },
  sideButton: { padding: 10 },
  toolsContainer: {
    width: "100%",
    position: "absolute",
    bottom: 0,
    height: 100,
    justifyContent: "center",
    zIndex: 10,
  },
  lutSelectorWrapper: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
