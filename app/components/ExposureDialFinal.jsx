import * as Haptics from "expo-haptics";
import { useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { runOnJS } from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

const SUB_SPACING = 15;
const TOTAL_LINES = 51;
const GROUP = 5;
const MAX_LINES_HALF = Math.floor(TOTAL_LINES / 2);
const CONTAINER_WIDTH = screenWidth * 0.9;

export default function ExposureDialFinal({
  value,
  onChange,
  onRelease,
  zoomSV,
  minZoom,
  maxZoom,
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const lastIndex = useRef(0);
  const accumulatedOffset = useRef(0);
  const startOffset = useRef(0);

  const MAX_INDEX = MAX_LINES_HALF;
  const MIN_INDEX = -MAX_LINES_HALF;

  const initialNormalProgress = (value - minZoom) / (maxZoom - minZoom);
  const clampedProgress = Math.min(Math.max(initialNormalProgress, 0), 1);
  const initialIndex = MIN_INDEX + clampedProgress * (MAX_INDEX - MIN_INDEX);
  offset.setValue(initialIndex * SUB_SPACING);
  accumulatedOffset.current = initialIndex * SUB_SPACING;
  lastIndex.current = initialIndex;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startOffset.current = accumulatedOffset.current;
      },
      onPanResponderMove: (_, gesture) => {
        const SENSITIVITY = 0.5;
        let totalOffset = startOffset.current + gesture.dx * SENSITIVITY;
        let index = Math.round(totalOffset / SUB_SPACING);

        if (index > MAX_INDEX) index = MAX_INDEX;
        if (index < MIN_INDEX) index = MIN_INDEX;

        offset.setValue(index * SUB_SPACING);

        if (index !== lastIndex.current) {
          const isMajor = index % GROUP === 0;
          Haptics.impactAsync(
            isMajor
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );

          const normalProgress = (index - MIN_INDEX) / (MAX_INDEX - MIN_INDEX);
          const invertedZoom = 1 - normalProgress;
          const zoomValue = minZoom + (1 - invertedZoom) * (maxZoom - minZoom);
          zoomSV.value = zoomValue;
          runOnJS(onChange)(zoomValue);
          lastIndex.current = index;
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const SENSITIVITY = 0.5;
        let totalOffset = startOffset.current + gesture.dx * SENSITIVITY;
        let index = Math.round(totalOffset / SUB_SPACING);

        if (index > MAX_INDEX) index = MAX_INDEX;
        if (index < MIN_INDEX) index = MIN_INDEX;

        accumulatedOffset.current = index * SUB_SPACING;

        const normalProgress = (index - MIN_INDEX) / (MAX_INDEX - MIN_INDEX);
        const invertedZoom = 1 - normalProgress;
        const zoomValue = minZoom + (1 - invertedZoom) * (maxZoom - minZoom);
        zoomSV.value = zoomValue;
        runOnJS(onChange)(zoomValue);
        lastIndex.current = index;

        // Remove the spring animation to prevent oscillation
        onRelease?.();
      },
    }),
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

          const translateX = Animated.add(
            offset,
            new Animated.Value(index * SUB_SPACING),
          );

          const opacity = translateX.interpolate({
            inputRange: [-CONTAINER_WIDTH / 2, 0, CONTAINER_WIDTH / 2],
            outputRange: [0, 1, 0],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={i}
              style={[
                styles.line,
                {
                  height: isMajor ? 50 : 25,
                  opacity,
                  backgroundColor: isMajor ? "#fff" : "#777",
                  transform: [{ translateX }],
                },
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
  container: { height: 100, alignItems: "center", justifyContent: "center" },
  dialContainer: {
    height: 80,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  line: { position: "absolute", width: 2, borderRadius: 1 },
  pointer: {
    position: "absolute",
    width: 2,
    height: 60,
    backgroundColor: "#ffaa00",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
});
