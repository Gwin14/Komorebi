import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { TouchableOpacity } from "react-native";
import styles from "./BackButton.styles";

export default function BackButton({ top = 59, left = 16 }) {
  return (
    <TouchableOpacity
      style={[styles.button, { top, left }]}
      onPress={() => router.back()}
    >
      <Ionicons name="chevron-back" size={32} color="white" />
    </TouchableOpacity>
  );
}
