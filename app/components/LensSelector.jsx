import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: -52,
    left: 0,
    right: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
    pointerEvents: "box-none",
  },
  scroll: {
    paddingHorizontal: 18,
    gap: 12,
    alignItems: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  button: {
    minWidth: 64,
    // height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonInactive: {
    // backgroundColor: "rgba(30,30,30,0.96)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonActive: {
    backgroundColor: "rgba(255,170,0,0.16)",
    borderColor: "#ffaa00",
    shadowColor: "#ffaa00",
    shadowOpacity: 0.4,
  },
  label: {
    color: "#f5f5f5",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  labelActive: {
    color: "#ffaa00",
    fontWeight: "800",
    textShadowColor: "rgba(255,170,0,0.7)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  activeDot: {
    position: "absolute",
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#ffaa00",
  },
});
