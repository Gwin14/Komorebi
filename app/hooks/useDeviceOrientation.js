import { useIsFocused } from "@react-navigation/native";
import { subscribeDeviceMotion } from "../utils/deviceMotion";
import { useEffect, useRef, useState } from "react";
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Custom hook to track device orientation and provide an animated style for rotation.
 * @returns {object} Animated rotation style and normalized device orientation.
 */
export function useDeviceOrientationState() {
  const focused = useIsFocused();
  const rotation = useSharedValue("0deg");
  const orientationRef = useRef(0);
  const [orientation, setOrientation] = useState(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(rotation.value, { duration: 200 }) }],
  }));

  useEffect(() => {
    if (!focused) return;
    return subscribeDeviceMotion((data) => {
      const { orientation } = data;
      let nextOrientation = 0;

      if (orientation === 90) {
        nextOrientation = -90;
      } else if (orientation === -90 || orientation === 270) {
        nextOrientation = 90;
      } else if (orientation === 0) {
        nextOrientation = 0;
      } else if (orientation === 180 || orientation === -180) {
        nextOrientation = 180;
      } else {
        return;
      }

      if (nextOrientation !== orientationRef.current) {
        rotation.value = `${nextOrientation}deg`;
        orientationRef.current = nextOrientation;
        setOrientation(nextOrientation);
      }
    }, 200);
  }, [focused, rotation]);

  return { animatedStyle, orientation };
}

export default function useDeviceOrientation() {
  return useDeviceOrientationState().animatedStyle;
}
