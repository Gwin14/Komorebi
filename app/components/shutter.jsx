import * as Haptics from "expo-haptics";
import { StyleSheet, TouchableOpacity } from "react-native";

export default function Shutter({ takePicture }) {
  return (
    <TouchableOpacity
      style={styles.shutter}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        takePicture();
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
