import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";

const { width: screenWidth } = Dimensions.get("window");

const SUB_SPACING = 12;
const TOTAL_LINES = 41;
const GROUP = 5;
const MAX_LINES_HALF = Math.floor(TOTAL_LINES / 2);
const CONTAINER_WIDTH = screenWidth * 0.9;
const FATOR_PERSPECTIVA = 0.05;
const MAX_SCALE = 1.6;
const MIN_SCALE_X = 0.5;
const BASE_MAJOR_HEIGHT = 70;
const BASE_MINOR_HEIGHT = 35;

export default function ExposureDialFinal({ value, maxValue = 1, onChange }) {
  const offset = useRef(new Animated.Value(0)).current;
  const lastIndex = useRef(0);
  const accumulatedOffset = useRef(0);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => setCurrentValue(value), [value]);

  const MAX_INDEX = MAX_LINES_HALF;
  const MIN_INDEX = -MAX_LINES_HALF;

  const triggerHaptic = (isMajor) => {
    if (isMajor) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
        40
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        let totalOffset = accumulatedOffset.current + gesture.dx;
        let index = Math.round(totalOffset / SUB_SPACING);
        if (index > MAX_INDEX) index = MAX_INDEX;
        if (index < MIN_INDEX) index = MIN_INDEX;

        totalOffset = index * SUB_SPACING;
        offset.setValue(totalOffset);

        if (index !== lastIndex.current) {
          const isMajor = index % GROUP === 0;
          triggerHaptic(isMajor);
          if (isMajor) {
            const newValue =
              maxValue - ((index + MAX_LINES_HALF) / TOTAL_LINES) * maxValue;
            setCurrentValue(newValue);
            onChange?.(newValue);
          }
          lastIndex.current = index;
        }
      },
      onPanResponderRelease: (_, gesture) => {
        let totalOffset = accumulatedOffset.current + gesture.dx;
        let index = Math.round(totalOffset / SUB_SPACING);
        if (index > MAX_INDEX) index = MAX_INDEX;
        if (index < MIN_INDEX) index = MIN_INDEX;

        Animated.timing(offset, {
          toValue: index * SUB_SPACING,
          duration: 150,
          useNativeDriver: true,
        }).start();

        accumulatedOffset.current = index * SUB_SPACING;
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View
        style={[styles.dialContainer, { width: CONTAINER_WIDTH }]}
        {...pan.panHandlers}
      >
        {Array.from({ length: TOTAL_LINES }).map((_, i) => {
          const index = i - MAX_LINES_HALF;
          const isMajor = index % GROUP === 0;
          const HEIGHT = isMajor ? BASE_MAJOR_HEIGHT : BASE_MINOR_HEIGHT;
          const translateX = Animated.add(
            offset,
            new Animated.Value(index * SUB_SPACING)
          );

          const centerDistance = translateX.interpolate({
            inputRange: [-CONTAINER_WIDTH / 2, CONTAINER_WIDTH / 2],
            outputRange: [-CONTAINER_WIDTH / 2, CONTAINER_WIDTH / 2],
            extrapolate: "clamp",
          });

          const scaleX = centerDistance.interpolate({
            inputRange: [-CONTAINER_WIDTH / 2, 0, CONTAINER_WIDTH / 2],
            outputRange: [MIN_SCALE_X, MAX_SCALE, MIN_SCALE_X],
            extrapolate: "clamp",
          });

          const scaleY = scaleX.interpolate({
            inputRange: [MIN_SCALE_X, 1.0, MAX_SCALE],
            outputRange: [0.3, 0.7, 1.0],
            extrapolate: "clamp",
          });

          const opacity = centerDistance.interpolate({
            inputRange: [
              -CONTAINER_WIDTH / 2,
              -CONTAINER_WIDTH * FATOR_PERSPECTIVA,
              CONTAINER_WIDTH * FATOR_PERSPECTIVA,
              CONTAINER_WIDTH / 2,
            ],
            outputRange: [0.3, 1, 1, 0.3],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={i}
              style={[
                styles.line,
                isMajor ? styles.majorLine : styles.minorLine,
                {
                  height: HEIGHT,
                  opacity,
                  transform: [{ translateX }, { scaleX }, { scaleY }],
                },
                { backgroundColor: isMajor ? "#fff" : "#888" },
              ]}
            />
          );
        })}
        <View style={styles.pointer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  dialContainer: {
    height: 120,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  line: { position: "absolute", width: 2 },
  majorLine: {},
  minorLine: {},
  pointer: {
    position: "absolute",
    width: 3,
    height: 70,
    backgroundColor: "#ff006e",
    zIndex: 10,
  },
});
