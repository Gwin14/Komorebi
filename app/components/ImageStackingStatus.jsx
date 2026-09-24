import { Text, TouchableOpacity, View } from "react-native";
import styles from "./ImageStackingStatus.styles";

const LABELS = {
  preparing: "Preparando",
  capturing: "Capturando",
  analyzing: "Analisando",
  compositing: "Compondo",
  exporting: "Exportando",
};

export default function ImageStackingStatus({ progress, onCancel }) {
  if (!progress || ["idle", "completed", "cancelled", "failed"].includes(progress.state)) {
    return null;
  }
  const seconds = Math.max(0, Math.floor(progress.elapsedSeconds || 0));
  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>{LABELS[progress.state] || "Processando"}</Text>
        <Text style={styles.detail}>
          {["bulb", "motionBlur"].includes(progress.strategyId)
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : `${progress.acceptedFrames || progress.capturedFrames || 0} frames`}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round((progress.progress || 0) * 100)}%` },
            ]}
          />
        </View>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
