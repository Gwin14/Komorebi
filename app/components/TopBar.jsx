import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function TopBar({
  flash,
  toggleFlash,
  toggleMode,
  activeControl,
  selectedLutId,
}) {
  const router = useRouter();

  return (
    <View style={styles.buttonsContainer}>
      <TouchableOpacity onPress={toggleFlash}>
        <Ionicons
          name={flash === "off" ? "flash-off-outline" : "flash-outline"}
          size={32}
          color="white"
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => toggleMode("zoom")}>
        <Ionicons
          name="aperture-outline"
          size={32}
          color={activeControl === "zoom" ? "#ffaa00" : "white"}
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => toggleMode("lut")}>
        <Ionicons
          name="color-filter-outline"
          size={32}
          color={
            activeControl === "lut"
              ? "#ffaa00"
              : selectedLutId !== "none"
              ? "#ffaa00"
              : "white"
          }
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("components/Settings")}>
        <Ionicons name="settings-outline" size={32} color="white" />
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
});
