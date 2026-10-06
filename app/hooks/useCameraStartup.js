import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

// Startup is a one-way handoff: changing lenses or capture modes must not
// bring the splash back over an already usable camera.
export default function useCameraStartup({ loading, ready }) {
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [revealed, setRevealed] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (loading || revealed) return;
    let cancelled = false;
    let animation;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled || reduceMotion) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.6,
            duration: 850,
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 850,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      animation.start();
    }).catch(() => {});
    return () => {
      cancelled = true;
      animation?.stop();
      pulse.setValue(1);
    };
  }, [loading, pulse, revealed]);

  useEffect(() => {
    if (loading || revealed) return;
    if (ready) {
      setRevealed(true);
      return;
    }
    // Keep settings and permission actions reachable if the camera fails
    // to start. This does not mark the camera itself ready for capture.
    const timeout = setTimeout(() => setRevealed(true), 8000);
    return () => clearTimeout(timeout);
  }, [loading, ready, revealed]);

  useEffect(() => {
    if (!revealed) return;
    let cancelled = false;
    let animation;
    const reveal = async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(
        () => false,
      );
      if (cancelled) return;
      animation = Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion ? 0 : 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      animation.start(({ finished }) => {
        if (finished) setComplete(true);
      });
    };
    void reveal();
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [progress, revealed]);

  return { progress, pulse, complete };
}
