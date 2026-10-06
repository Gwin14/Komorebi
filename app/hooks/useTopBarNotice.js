import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

const FADE_DURATION = 180;
const NOTICE_DURATION = 1800;

// Keep the notice lifecycle in the screen so moving the TopBar does not replay it.
export default function useTopBarNotice() {
  const [message, setMessage] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const animation = useRef(null);
  const generation = useRef(0);

  const showNotice = useCallback((text) => {
    if (!text?.trim()) return;
    const currentGeneration = ++generation.current;
    animation.current?.stop();
    setMessage(text.trim());
    AccessibilityInfo.announceForAccessibility(text.trim());
    animation.current = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }),
      Animated.delay(NOTICE_DURATION),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }),
    ]);
    animation.current.start(({ finished }) => {
      if (finished && generation.current === currentGeneration) {
        setMessage(null);
      }
    });
  }, [opacity]);

  useEffect(() => () => {
    generation.current += 1;
    animation.current?.stop();
  }, []);

  return { message, opacity, showNotice };
}
