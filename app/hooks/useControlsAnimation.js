import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export default function useControlsAnimation(activeControl) {
  const controlsAnim = useRef(new Animated.Value(0)).current;
  const [displayedControl, setDisplayedControl] = useState(() =>
    activeControl !== "none" && activeControl !== "manual"
      ? activeControl
      : null,
  );

  useEffect(() => {
    const showTools = activeControl !== "none" && activeControl !== "manual";
    if (showTools) setDisplayedControl(activeControl);

    Animated.timing(controlsAnim, {
      toValue: showTools ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !showTools) setDisplayedControl(null);
    });
  }, [activeControl, controlsAnim]);

  return { controlsAnim, displayedControl };
}
