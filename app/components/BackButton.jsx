import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { TouchableOpacity } from "react-native";

export default function BackButton({ top = 59, left = 16 }) {
  return (
    <TouchableOpacity
      style={{ position: "absolute", top: top, left: left, zIndex: 10 }}
      onPress={() => router.back()}
    >
      <Ionicons name="chevron-back" size={32} color="white" />
    </TouchableOpacity>
  );
}
