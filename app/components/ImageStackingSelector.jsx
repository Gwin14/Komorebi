import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import styles from "./ImageStackingSelector.styles";

const MODES = [
  { id: null, label: "Desligado", icon: "close-circle-outline" },
  { id: "noiseReduction", label: "Menos ruído", icon: "sparkles-outline" },
  { id: "night", label: "Noturno", icon: "moon-outline" },
  { id: "bulb", label: "Bulb", icon: "timer-outline" },
];

export default function ImageStackingSelector({ value, onChange, disabled }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Image Stacking</Text>
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
