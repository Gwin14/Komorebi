import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export function ExifItem({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color="#ffaa00" />
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    color: "#aaa",
    marginLeft: 8,
    marginRight: 4,
    fontSize: 14,
  },
  value: {
    color: "#fff",
    fontSize: 14,
  },
});
