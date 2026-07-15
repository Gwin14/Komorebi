import React from "react";
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import styles from "./LUTSelector.styles";

const LUT_GRADIENTS = {
  none: ["#d9d9d9", "#858585", "#252525"],
  filtro1: ["#254d32", "#73a942", "#d8bf45"],
  filtro2: ["#fff06a", "#f7b32b", "#e76f00"],
  filtro3: ["#172554", "#4452a3", "#9b72cf"],
  filtro4: ["#ff4f87", "#db2777", "#7f1d4e"],
  filtro5: ["#ffcc80", "#e8874a", "#9f4937"],
  filtro6: ["#172d33", "#3c6970", "#d4945b"],
  filtro7: ["#40203f", "#773b73", "#c16a9d"],
  filtro8: ["#fff2a6", "#f5cb42", "#bd7925"],
};

const CUSTOM_GRADIENTS = [
  ["#315c72", "#6a8d92", "#e6c79c"],
  ["#4d194d", "#893168", "#e56b6f"],
  ["#386641", "#6a994e", "#dda15e"],
  ["#3d405b", "#81739d", "#f2cc8f"],
  ["#264653", "#2a9d8f", "#e9c46a"],
];

const getLutGradient = (lut) => {
  if (LUT_GRADIENTS[lut.id]) return LUT_GRADIENTS[lut.id];

  const hash = [...lut.name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return CUSTOM_GRADIENTS[hash % CUSTOM_GRADIENTS.length];
};

export default function LUTSelector({
  selectedLutId,
  onSelectLut,
  selectedGrainId,
  onSelectGrain,
  selectedHalationId,
  onSelectHalation,
  visible,
  availableLuts,
  availableGrains,
  availableHalations,
}) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim, visible]);

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
      <View style={styles.selectorSection}>
        <Text style={styles.sectionTitle}>Filtro</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {availableLuts.map((lut) => (
            <TouchableOpacity
              key={lut.id}
              style={[
                styles.polaroidButton,
                selectedLutId === lut.id && styles.polaroidButtonSelected,
              ]}
              onPress={() => onSelectLut(lut.id)}
              accessibilityRole="button"
              accessibilityLabel={`Filtro ${lut.name}`}
              accessibilityState={{ selected: selectedLutId === lut.id }}
            >
              <View
                style={[
                  styles.polaroid,
                  selectedLutId === lut.id && styles.polaroidSelected,
                ]}
              >
                <LinearGradient
                  colors={getLutGradient(lut)}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.polaroidPhoto}
                >
                  <View style={styles.polaroidPhotoHighlight} />
                </LinearGradient>
                <View style={styles.polaroidCaption}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.polaroidName,
                      selectedLutId === lut.id && styles.polaroidNameSelected,
                    ]}
                  >
                    {lut.name}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.selectorSection, styles.compactSection]}>
        <Text style={styles.sectionTitle}>Grão</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.compactScrollContent}
        >
          {availableGrains.map((grain) => (
            <TouchableOpacity
              key={grain.id}
              style={[
                styles.lutButton,
                selectedGrainId === grain.id && styles.lutButtonSelected,
              ]}
              onPress={() => onSelectGrain(grain.id)}
            >
              <View
                style={[
                  styles.lutPreview,
                  styles.compactPreview,
                  selectedGrainId === grain.id && styles.lutPreviewSelected,
                ]}
              >
                <Text style={[styles.lutIcon, styles.compactIcon]}>
                  {grain.id === "none" ? "○" : "✦"}
                </Text>
              </View>
              <Text
                style={[
                  styles.lutName,
                  selectedGrainId === grain.id && styles.lutNameSelected,
                ]}
              >
                {grain.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.selectorSection, styles.compactSection]}>
        <Text style={styles.sectionTitle}>Halation</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.compactScrollContent}
        >
          {availableHalations.map((halation) => (
            <TouchableOpacity
              key={halation.id}
              style={[
                styles.lutButton,
                selectedHalationId === halation.id && styles.lutButtonSelected,
              ]}
              onPress={() => onSelectHalation(halation.id)}
            >
              <View
                style={[
                  styles.lutPreview,
                  styles.compactPreview,
                  selectedHalationId === halation.id &&
                    styles.lutPreviewSelected,
                ]}
              >
                <Text style={[styles.lutIcon, styles.compactIcon]}>
                  {halation.id === "none" ? "○" : "◉"}
                </Text>
              </View>
              <Text
                style={[
                  styles.lutName,
                  selectedHalationId === halation.id && styles.lutNameSelected,
                ]}
              >
                {halation.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Animated.View>
  );
}
