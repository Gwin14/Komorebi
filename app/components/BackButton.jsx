import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { TouchableOpacity } from "react-native";
import styles from "./BackButton.styles";

export default function BackButton({ top = 59, left = 16, inline = false, onPress }) {
  return (
    <TouchableOpacity
      style={inline ? styles.inlineButton : [styles.button, { top, left }]}
      accessibilityLabel="Voltar"
      accessibilityRole="button"
      onPress={onPress ?? (() => router.back())}
    >
      <Ionicons name="chevron-back" size={32} color="white" />
    </TouchableOpacity>
  );
}
