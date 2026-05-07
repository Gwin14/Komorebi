import * as Haptics from "expo-haptics";
import { StyleSheet, TouchableOpacity, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { useSettings } from "../context/SettingsContext";
import useShutterSound from "../utils/useShutterSound";

export default function Shutter({ takePicture, isProcessing }) {
  const { shutterSound } = useSettings();
  const playShutterSound = useShutterSound();

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isProcessing) {
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 0.95,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        )
      ]).start();
    } else {
      scaleAnim.setValue(1);
      glowAnim.setValue(0);
    }
  }, [isProcessing]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: glowAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1],
        }),
      }}
    >
      <TouchableOpacity
        style={styles.shutter}
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (shutterSound) {
            await playShutterSound();
          }
          await takePicture();
        }}
        disabled={isProcessing}
      ></TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "#ffaa00ff",
    backgroundColor: "#000000", // botão escuro para destacar o neon
    shadowColor: "#ffaa00ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 15, // Android
    alignSelf: "center",
  },
});
