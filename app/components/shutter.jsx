import * as Haptics from "expo-haptics";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSettings } from "../context/SettingsContext";
import useShutterSound from "../utils/useShutterSound";

export default function Shutter({ takePicture }) {
  const { shutterSound } = useSettings();
  const playShutterSound = useShutterSound();

  return (
    <TouchableOpacity
      style={styles.shutter}
      onPress={async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (shutterSound) {
          await playShutterSound();
        }
        await takePicture();
      }}
    ></TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "#ffaa00ff",
    backgroundColor: "#000000", // botão escuro para destacar o neon
    shadowColor: "#ffaa00ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 15, // Android
    alignSelf: "center",
  },
});
