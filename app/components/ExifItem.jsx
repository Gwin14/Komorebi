import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import styles from "./ExifItem.styles";

export function ExifItem({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={16} color="#ffaa00" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">
          {value}
        </Text>
      </View>
    </View>
  );
}
