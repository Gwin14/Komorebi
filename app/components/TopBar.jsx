import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Animated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";

export default function TopBar({
  flash,
  toggleFlash,
  toggleMode,
  activeControl,
  selectedLutId,
}) {
  const router = useRouter();
  const animatedStyle = useDeviceOrientation();

  return (
    <View style={styles.buttonsContainer}>
      <TouchableOpacity onPress={toggleFlash}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name={flash === "off" ? "flash-off-outline" : "flash-outline"}
            size={32}
            style={styles.button}
            color="white"
          />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => toggleMode("zoom")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="aperture-outline"
            size={32}
            style={styles.button}
            color={activeControl === "zoom" ? "#ffaa00" : "white"}
          />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => toggleMode("lut")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="color-filter-outline"
            size={32}
            style={styles.button}
            color={
              activeControl === "lut"
                ? "#ffaa00"
                : selectedLutId !== "none"
                  ? "#ffaa00"
                  : "white"
            }
          />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("components/Settings")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="settings-outline"
            size={32}
            color="white"
            style={styles.button}
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonsContainer: {
    position: "absolute",
    top: 64,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    zIndex: 10,
  },
  button: {},
});
