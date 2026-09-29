import { Text, TouchableOpacity, View } from "react-native";
import { ASPECT_RATIO_OPTIONS } from "../utils/aspectRatios";
import styles from "./AspectRatioSelector.styles";

export default function AspectRatioSelector({ value, onChange, disabled }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Proporção da foto</Text>
      <View style={styles.options}>
        {ASPECT_RATIO_OPTIONS.map((option) => {
          const active = value === option.id;

          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onChange(option.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Proporção ${option.label}`}
              accessibilityState={{ selected: active, disabled }}
            >
              <View
                style={[
                  styles.frame,
                  styles[`frame${option.id.replace(":", "")}`],
                  active && styles.frameActive,
                ]}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
