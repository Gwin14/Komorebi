import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export default function useControlsAnimation(activeControl) {
  const controlsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showTools = activeControl !== "none" && activeControl !== "manual";

    Animated.timing(controlsAnim, {
      toValue: showTools ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [activeControl, controlsAnim]);

  return controlsAnim;
}
