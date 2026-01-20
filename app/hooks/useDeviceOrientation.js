import { DeviceMotion } from "expo-sensors";
import { useEffect } from "react";
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Custom hook to track device orientation and provide an animated style for rotation.
 * @returns {object} An animated style object with a rotation transform.
 */
export default function useDeviceOrientation() {
  const rotation = useSharedValue("0deg");

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(rotation.value, { duration: 200 }) }],
  }));

  useEffect(() => {
    DeviceMotion.setUpdateInterval(200);
    const subscription = DeviceMotion.addListener((data) => {
      const { orientation } = data;
      if (orientation === 90) {
        rotation.value = "-90deg";
      } else if (orientation === -90 || orientation === 270) {
        rotation.value = "90deg";
      } else if (orientation === 0) {
        rotation.value = "0deg";
      } else if (orientation === 180 || orientation === -180) {
        rotation.value = "180deg";
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return animatedStyle;
}
