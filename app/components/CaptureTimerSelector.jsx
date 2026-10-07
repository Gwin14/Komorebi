import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import { CAPTURE_TIMER_OPTIONS } from "../utils/captureTimer";
import styles from "./CaptureTimerSelector.styles";

export default function CaptureTimerSelector({ value, onChange }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Timer</Text>
      {CAPTURE_TIMER_OPTIONS.map(({ seconds, label }) => (
        <TouchableOpacity
          key={seconds}
          style={[styles.option, value === seconds && styles.optionActive]}
          onPress={() => onChange(seconds)}
          accessibilityRole="button"
          accessibilityLabel={`Timer ${label}`}
          accessibilityState={{ selected: value === seconds }}
        >
          <Ionicons name="timer-outline" size={20} color={value === seconds ? "#ffaa00" : "white"} />
          <Text style={[styles.label, value === seconds && styles.labelActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
