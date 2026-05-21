import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, TouchableOpacity } from "react-native";
import { useSettings } from "../context/SettingsContext";
import useShutterSound from "../utils/useShutterSound";
import styles from "./shutter.styles";

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
          ]),
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
          ]),
        ),
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

