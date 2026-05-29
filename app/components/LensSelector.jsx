import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import styles from "./LensSelector.styles";

export default function LensSelector({
  lenses = [],
  activeLensId,
  onSelectLens,
}) {
  if (!lenses.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow} pointerEvents="auto">
        {lenses.map((lens) => {
          const active = lens.id === activeLensId;
          return (
            <TouchableOpacity
              key={lens.id}
              onPress={() => onSelectLens?.(lens.id)}
              style={[
                styles.button,
                active ? styles.buttonActive : styles.buttonInactive,
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {lens.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

