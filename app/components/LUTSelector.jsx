import React from "react";
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import styles from "./LUTSelector.styles";

export default function LUTSelector({
  selectedLutId,
  onSelectLut,
  selectedGrainId,
  onSelectGrain,
  visible,
  availableLuts,
  availableGrains,
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
      </View>

      <View style={styles.selectorSection}>
        <Text style={styles.sectionTitle}>Grão</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
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
                  selectedGrainId === grain.id && styles.lutPreviewSelected,
                ]}
              >
                <Text style={styles.lutIcon}>
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
    </Animated.View>
  );
}
