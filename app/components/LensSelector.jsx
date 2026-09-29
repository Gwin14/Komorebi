import * as Haptics from "expo-haptics";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import styles from "./LensSelector.styles";

export default function LensSelector({
  lenses = [],
  activeLensId,
  onSelectLens,
}) {
  if (!lenses.length) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        pointerEvents="auto"
      >
        {lenses.map((lens) => {
          const active = lens.id === activeLensId;
          return (
            <TouchableOpacity
              key={lens.id}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelectLens?.(lens.id);
              }}
              activeOpacity={0.72}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Zoom ${lens.label} vezes`}
              accessibilityState={{ selected: active }}
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
      </ScrollView>
    </View>
  );
}
