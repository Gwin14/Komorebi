import React from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AVAILABLE_LUTS } from "../utils/lutProcessor";

export default function LUTSelector({ selectedLutId, onSelectLut, visible }) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  const opacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Escolha um filtro</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {AVAILABLE_LUTS.map((lut) => (
          <TouchableOpacity
            key={lut.id}
            style={[
              styles.lutButton,
              selectedLutId === lut.id && styles.lutButtonSelected,
            ]}
            onPress={() => onSelectLut(lut.id)}
          >
            <View
              style={[
                styles.lutPreview,
                selectedLutId === lut.id && styles.lutPreviewSelected,
              ]}
            >
              <Text style={styles.lutIcon}>
                {lut.id === "none" ? "○" : "●"}
              </Text>
            </View>
            <Text
              style={[
                styles.lutName,
                selectedLutId === lut.id && styles.lutNameSelected,
              ]}
            >
              {lut.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1aee",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  lutButton: {
    alignItems: "center",
    marginRight: 12,
  },
  lutPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#444",
    marginBottom: 8,
  },
  lutPreviewSelected: {
    borderColor: "#ffaa00",
    backgroundColor: "#3a3a3a",
  },
  lutIcon: {
    fontSize: 24,
    color: "#fff",
  },
  lutName: {
    color: "#aaa",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 70,
  },
  lutNameSelected: {
    color: "#ffaa00",
    fontWeight: "600",
  },
});
