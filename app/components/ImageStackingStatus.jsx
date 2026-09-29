import { Text, TouchableOpacity, View } from "react-native";
import styles from "./ImageStackingStatus.styles";

const LABELS = {
  preparing: "Preparando",
  capturing: "Capturando",
  awaitingSecondExposure: "Enquadre a segunda foto",
  analyzing: "Analisando",
  compositing: "Compondo",
  exporting: "Exportando",
};

export default function ImageStackingStatus({ progress, onCancel }) {
  const current = progress || {};
  const seconds = Math.max(0, Math.floor(current.elapsedSeconds || 0));
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{LABELS[current.state] || "Preparando"}</Text>
      <Text style={styles.detail}>
        {current.strategyId === "doubleExposure"
          ? `${current.capturedFrames || 0}/2`
          : ["bulb", "motionBlur"].includes(current.strategyId)
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : `${current.acceptedFrames || current.capturedFrames || 0} frames`}
      </Text>
      <TouchableOpacity onPress={onCancel} style={styles.cancelButton} accessibilityLabel="Cancelar captura">
        <Text style={styles.cancelText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}
