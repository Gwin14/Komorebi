import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import styles from "./Galery.styles";

export default function GalleryActionProgress({ operation, onCancel }) {
  if (!operation) return null;
  return (
    <View style={styles.operationProgress} accessibilityLiveRegion="polite">
      <ActivityIndicator color="#ffaa00" />
      <Text style={styles.operationText}>
        {operation.label} · {operation.completed}/{operation.total}
      </Text>
      {operation.cancellable && (
        <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.selectionButton}>
          <Text style={styles.infoActionText}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
