import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Dimensions, PanResponder, Text, View } from "react-native";
import styles from "./ManualControlDial.styles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DIAL_WIDTH = SCREEN_WIDTH * 0.7;
const TICK_SPACING = 15;
const TICKS_COUNT = 41; // odd, so there is a centered tick

// Generic drag-to-adjust ruler dial for a single numeric value within
// [min, max]. Used for ISO, shutter speed, white balance and focus, each of
// which has its own scale/format handled by the caller.
export default function ManualControlDial({
  value,
  min,
  max,
  onChange,
  onRelease,
  resetValue,
  formatLabel,
}) {
  const valueRef = useRef(value);
  const valueStart = useRef(value);
  const lastHapticStep = useRef(0);

  const progressFor = (v) => {
    if (max === min) return 0.5;
    return Math.min(1, Math.max(0, (v - min) / (max - min)));
  };

  const valueFor = (progress) => min + progress * (max - min);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: () => {
        valueStart.current = valueRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const startProgress = progressFor(valueStart.current);
        const deltaProgress = -gestureState.dx / DIAL_WIDTH;
        const nextProgress = Math.min(1, Math.max(0, startProgress + deltaProgress));
        const nextValue = valueFor(nextProgress);

        const currentStep = Math.round(nextProgress * (TICKS_COUNT - 1));
        if (currentStep !== lastHapticStep.current) {
          lastHapticStep.current = currentStep;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        valueRef.current = nextValue;
        onChange(nextValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        const wasTap =
          Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;

        if (wasTap && resetValue !== undefined) {
          valueRef.current = resetValue;
          valueStart.current = resetValue;
          onChange(resetValue);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else {
          valueStart.current = valueRef.current;
        }

        onRelease?.();
      },
    }),
  ).current;

  const progress = progressFor(value);
  const translateX = DIAL_WIDTH / 2 - progress * (TICKS_COUNT - 1) * TICK_SPACING;

  return (
    <View style={styles.container}>
      <Text style={styles.valueText}>{formatLabel(value)}</Text>

      <View
        style={[styles.dialContainer, { width: DIAL_WIDTH }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.ruleTrack, { transform: [{ translateX }] }]}>
          {Array.from({ length: TICKS_COUNT }).map((_, i) => {
            const isMajor = i % 5 === 0;
            const isCenter = i === Math.floor(TICKS_COUNT / 2);

            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  isMajor ? styles.majorTick : styles.minorTick,
                  isCenter && styles.centerTick,
                  { marginRight: i === TICKS_COUNT - 1 ? 0 : TICK_SPACING },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.centerIndicator} pointerEvents="none" />
      </View>
    </View>
  );
}
