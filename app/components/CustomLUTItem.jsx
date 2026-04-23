import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(17, 17, 17, 0.8)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  name: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
    fontWeight: "500",
  },
  deleteButton: {
    backgroundColor: "rgba(170, 34, 34, 0.9)",
    borderRadius: 8,
    padding: 8,
    marginLeft: 12,
  },
  deleteButtonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(170, 34, 34, 0.7)",
  },
});
