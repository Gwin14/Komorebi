import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import styles from "./ImageStackingSelector.styles";

const MODES = [
  { id: null, label: "Desligado", icon: "close-circle-outline" },
  { id: "bulb", label: "Bulb", icon: "timer-outline" },
  { id: "motionBlur", label: "Motion Blur", icon: "speedometer-outline" },
  { id: "doubleExposure", label: "Dupla exposição", icon: "copy-outline" },
];

export default function ImageStackingSelector({ value, onChange, disabled }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modo de captura</Text>
      <View style={styles.options}>
        {MODES.map((mode) => {
          const active = value === mode.id;
          return (
            <TouchableOpacity
              key={mode.id ?? "off"}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onChange(mode.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
            >
              <Ionicons
                name={mode.icon}
                size={22}
                color={active ? "#ffaa00" : "white"}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
                {mode.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
