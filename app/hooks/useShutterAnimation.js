import { useCallback, useRef } from "react";
import { Animated } from "react-native";

export default function useShutterAnimation() {
  const shutterAnim = useRef(new Animated.Value(0)).current;

  const animateShutter = useCallback(() => {
    shutterAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shutterAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(shutterAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shutterAnim]);

  return {
    animateShutter,
    shutterAnim,
  };
}
