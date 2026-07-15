import React from "react";
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Shutter from "./shutter";
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

const GRAIN_DOTS = [
  { left: "8%", top: "16%", size: 1 },
  { left: "24%", top: "64%", size: 1 },
  { left: "42%", top: "25%", size: 1 },
  { left: "69%", top: "72%", size: 1 },
  { left: "84%", top: "34%", size: 1 },
  { left: "55%", top: "82%", size: 1 },
  { left: "15%", top: "43%", size: 1 },
  { left: "75%", top: "12%", size: 1 },
  { left: "32%", top: "8%", size: 2 },
  { left: "91%", top: "76%", size: 1 },
  { left: "48%", top: "55%", size: 2 },
  { left: "5%", top: "84%", size: 1 },
  { left: "62%", top: "42%", size: 2 },
  { left: "35%", top: "77%", size: 2 },
  { left: "88%", top: "8%", size: 2 },
  { left: "20%", top: "22%", size: 2 },
  { left: "78%", top: "52%", size: 2 },
  { left: "52%", top: "10%", size: 2 },
];

const GRAIN_DOT_COUNTS = {
  none: 0,
  fine: 8,
  soft: 13,
  film: GRAIN_DOTS.length,
};

const HALATION_PREVIEWS = {
  none: ["#f2f2ed", "#8d8d88", "#3b3b3b"],
  soft: ["#fffdf3", "#e9b29a", "#7d352b"],
  medium: ["#fffdf3", "#f47b5d", "#ad2817"],
  film: ["#ffffff", "#ff4b2b", "#e01608"],
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
  takePicture,
  isProcessing,
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

      <View style={styles.effectsArea}>
        <View style={styles.effectsColumn}>
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
                    styles.effectButton,
                    selectedGrainId === grain.id &&
                      styles.effectButtonSelected,
                  ]}
                  onPress={() => onSelectGrain(grain.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Grão ${grain.name}`}
                  accessibilityState={{
                    selected: selectedGrainId === grain.id,
                  }}
                >
                  <View
                    style={[
                      styles.filmStrip,
                      selectedGrainId === grain.id &&
                        styles.effectPreviewSelected,
                    ]}
                  >
                    <View style={styles.filmPerforations}>
                      {[0, 1, 2].map((hole) => (
                        <View key={hole} style={styles.filmPerforation} />
                      ))}
                    </View>
                    <LinearGradient
                      colors={["#b8b5ab", "#5e5c58", "#242424"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.grainSample}
                    >
                      {GRAIN_DOTS.slice(
                        0,
                        GRAIN_DOT_COUNTS[grain.id] || 0,
                      ).map((dot, index) => (
                        <View
                          key={index}
                          style={[
                            styles.grainDot,
                            {
                              left: dot.left,
                              top: dot.top,
                              width: dot.size,
                              height: dot.size,
                            },
                          ]}
                        />
                      ))}
                    </LinearGradient>
                    <View style={styles.filmPerforations}>
                      {[0, 1, 2].map((hole) => (
                        <View key={hole} style={styles.filmPerforation} />
                      ))}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.effectName,
                      selectedGrainId === grain.id &&
                        styles.effectNameSelected,
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
                    styles.effectButton,
                    selectedHalationId === halation.id &&
                      styles.effectButtonSelected,
                  ]}
                  onPress={() => onSelectHalation(halation.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Halation ${halation.name}`}
                  accessibilityState={{
                    selected: selectedHalationId === halation.id,
                  }}
                >
                  <View
                    style={[
                      styles.halationLens,
                      selectedHalationId === halation.id &&
                        styles.effectPreviewSelected,
                    ]}
                  >
                    <LinearGradient
                      colors={
                        HALATION_PREVIEWS[halation.id] ||
                        HALATION_PREVIEWS.none
                      }
                      locations={[0, 0.42, 1]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.halationSample}
                    />
                  </View>
                  <Text
                    style={[
                      styles.effectName,
                      selectedHalationId === halation.id &&
                        styles.effectNameSelected,
                    ]}
                  >
                    {halation.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.quickShutterSlot}>
          <Shutter
            takePicture={takePicture}
            isProcessing={isProcessing}
            compact
          />
        </View>
      </View>
    </Animated.View>
  );
}
