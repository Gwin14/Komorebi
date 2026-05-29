import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import styles from "./CustomLUTItem.styles";

export default function CustomLUTItem({ name, onDelete }) {
  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDelete();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{name}</Text>
      <Pressable
        onPress={handleDelete}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.deleteButtonPressed,
        ]}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

