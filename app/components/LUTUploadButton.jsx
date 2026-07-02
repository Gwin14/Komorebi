import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import styles from "./LUTUploadButton.styles";

export default function LUTUploadButton({ onPress, disabled = false }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Ionicons name="cloud-upload-outline" size={24} color="white" />
    </Pressable>
  );
}
