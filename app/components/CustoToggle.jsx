import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export default function CustomToggle({ label, value, onValueChange }) {
  // Animação para mover a "bolinha" do toggle
  const moveAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(moveAnim, {
      toValue: value ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 50,
    }).start();
  }, [value]);

  const toggleHandler = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(!value);
  };

  const translateX = moveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 26], // Ajuste baseado no tamanho do container
  });

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable onPress={toggleHandler}>
        <View style={[styles.track, value && styles.trackActive]}>
          <Animated.View
            style={[
              styles.thumb,
              { transform: [{ translateX }] },
              value && styles.thumbActive,
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginVertical: 4,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  track: {
    width: 52,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#444",
    justifyContent: "center",
  },
  trackActive: {
    backgroundColor: "rgba(255, 170, 0, 0.2)", // Amber suave ao fundo
    borderColor: "#ffaa00",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius:7,
    backgroundColor: "#777",
  },
  thumbActive: {
    backgroundColor: "#ffaa00",
    // Efeito de brilho neon similar ao shutter
    shadowColor: "#ffaa00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
});
