import React from "react";
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import styles from "./LUTSelector.styles";

export default function LUTSelector({
  selectedLutId,
  onSelectLut,
  visible,
  availableLuts,
}) {
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
      {/* <View style={styles.header}>
        <Text style={styles.title}>Escolha um filtro</Text>
      </View> */}

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
    </Animated.View>
  );
}

