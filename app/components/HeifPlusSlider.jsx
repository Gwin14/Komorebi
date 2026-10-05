import { useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import styles from "./HeifPlusSettings.styles";

// Drawn in React Native so the control has the same appearance on each platform.
export default function HeifPlusSlider({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}) {
  const [width, setWidth] = useState(0);
  const config = useRef(null);
  config.current = { min, max, step, value, disabled, onChange, width };
  const touchStart = useRef(0);
  const clamp = (next) =>
    Number(
      Math.min(
        max,
        Math.max(min, min + Math.round((next - min) / step) * step),
      ).toFixed(4),
    );
  // Keep one responder throughout a drag; settings updates replace onChange each render.
  const responder = useMemo(() => {
    const updateAt = (x) => {
      const settings = config.current;
      if (settings.disabled || settings.width <= 0) return;
      const progress = Math.min(1, Math.max(0, (x - 12) / settings.width));
      const next = settings.min + progress * (settings.max - settings.min);
      const rounded = Number(
        Math.min(
          settings.max,
          Math.max(
            settings.min,
            settings.min +
              Math.round((next - settings.min) / settings.step) * settings.step,
          ),
        ).toFixed(4),
      );
      if (rounded !== settings.value) settings.onChange(rounded);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !config.current.disabled && config.current.width > 0,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !config.current.disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: (event) => {
        touchStart.current = event.nativeEvent.locationX;
        updateAt(touchStart.current);
      },
      onPanResponderMove: (_, gesture) =>
        updateAt(touchStart.current + gesture.dx),
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  const progress = (value - min) / (max - min);
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!disabled)
          onChange(
            clamp(
              value + (nativeEvent.actionName === "increment" ? step : -step),
            ),
          );
      }}
      style={[styles.slider, disabled && styles.disabled]}
      {...responder.panHandlers}
    >
      <View
        pointerEvents="none"
        style={styles.sliderScale}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      >
        <View style={styles.sliderRail} />
        <View style={styles.sliderTicks}>
          {Array.from({ length: 21 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.sliderTick,
                index % 5 === 0 && styles.sliderMajorTick,
              ]}
            />
          ))}
        </View>
        <View
          style={[styles.sliderIndicator, { left: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}
