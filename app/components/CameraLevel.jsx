import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import styles from "./CameraLevel.styles";

const UPDATE_INTERVAL = 50;
const SMOOTHING_FACTOR = 0.18;
const APPEAR_WITHIN_DEGREES = 12;
const FULL_OPACITY_WITHIN_DEGREES = 7;
const ENTER_ALIGNED_DEGREES = 1.5;
const EXIT_ALIGNED_DEGREES = 2.5;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const gravityInScreenCoordinates = ({ x, y }, orientation) => {
  const orientationRadians = (orientation * Math.PI) / 180;

  return {
    x: x * Math.cos(orientationRadians) + y * Math.sin(orientationRadians),
    y: -x * Math.sin(orientationRadians) + y * Math.cos(orientationRadians),
  };
};

export default function CameraLevel() {
  const rotate = useRef(new Animated.Value(0)).current;
  const orientationRotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const filteredGravity = useRef(null);
  const orientationRef = useRef(0);
  const alignedRef = useRef(false);
  const [aligned, setAligned] = useState(false);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(UPDATE_INTERVAL);

    const subscription = DeviceMotion.addListener((measurement) => {
      const gravity = measurement.accelerationIncludingGravity;
      if (!gravity) return;

      if (!filteredGravity.current) {
        filteredGravity.current = { x: gravity.x, y: gravity.y, z: gravity.z };
      } else {
        filteredGravity.current.x +=
          (gravity.x - filteredGravity.current.x) * SMOOTHING_FACTOR;
        filteredGravity.current.y +=
          (gravity.y - filteredGravity.current.y) * SMOOTHING_FACTOR;
        filteredGravity.current.z +=
          (gravity.z - filteredGravity.current.z) * SMOOTHING_FACTOR;
      }

      const screenGravity = gravityInScreenCoordinates(
        filteredGravity.current,
        measurement.orientation ?? 0,
      );
      const rollRadians = Math.atan2(screenGravity.x, -screenGravity.y);
      const rollDegrees = (rollRadians * 180) / Math.PI;
      const orientation = measurement.orientation ?? 0;

      // O traço se inclina no sentido oposto ao aparelho, como no app Câmera.
      rotate.setValue(clamp(-rollDegrees, -45, 45));

      const absoluteRoll = Math.abs(rollDegrees);
      opacity.setValue(
        clamp(
          (APPEAR_WITHIN_DEGREES - absoluteRoll) /
            (APPEAR_WITHIN_DEGREES - FULL_OPACITY_WITHIN_DEGREES),
          0,
          1,
        ),
      );

      if (orientation !== orientationRef.current) {
        orientationRef.current = orientation;
        Animated.timing(orientationRotate, {
          toValue: -orientation,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }

      const threshold = alignedRef.current
        ? EXIT_ALIGNED_DEGREES
        : ENTER_ALIGNED_DEGREES;
      const nextAligned = Math.abs(rollDegrees) <= threshold;

      if (nextAligned !== alignedRef.current) {
        alignedRef.current = nextAligned;
        setAligned(nextAligned);
      }
    });

    return () => {
      subscription.remove();
      DeviceMotion.setUpdateInterval(200);
    };
  }, [opacity, orientationRotate, rotate]);

  const lineStyle = aligned ? styles.lineAligned : styles.line;
  const rotation = rotate.interpolate({
    inputRange: [-45, 45],
    outputRange: ["-45deg", "45deg"],
  });
  const orientationRotation = orientationRotate.interpolate({
    inputRange: [-180, 180],
    outputRange: ["-180deg", "180deg"],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          opacity,
          transform: [{ rotate: orientationRotation }],
        },
      ]}
    >
      <View style={[styles.sideLine, styles.leftLine, lineStyle]} />
      <Animated.View
        style={[
          styles.centerLine,
          lineStyle,
          { transform: [{ rotate: rotation }] },
        ]}
      />
      <View style={[styles.sideLine, styles.rightLine, lineStyle]} />
    </Animated.View>
  );
}
