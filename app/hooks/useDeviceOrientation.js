import { DeviceMotion } from "expo-sensors";
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
  const rotation = useSharedValue("0deg");
  const orientationRef = useRef(0);
  const [orientation, setOrientation] = useState(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(rotation.value, { duration: 200 }) }],
  }));

  useEffect(() => {
    DeviceMotion.setUpdateInterval(200);
    const subscription = DeviceMotion.addListener((data) => {
      const { orientation } = data;
      let nextOrientation = 0;

      if (orientation === 90) {
        rotation.value = "-90deg";
        nextOrientation = -90;
      } else if (orientation === -90 || orientation === 270) {
        rotation.value = "90deg";
        nextOrientation = 90;
      } else if (orientation === 0) {
        rotation.value = "0deg";
      } else if (orientation === 180 || orientation === -180) {
        rotation.value = "180deg";
        nextOrientation = 180;
      } else {
        return;
      }

      if (nextOrientation !== orientationRef.current) {
        orientationRef.current = nextOrientation;
        setOrientation(nextOrientation);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [rotation]);

  return { animatedStyle, orientation };
}

export default function useDeviceOrientation() {
  return useDeviceOrientationState().animatedStyle;
}
