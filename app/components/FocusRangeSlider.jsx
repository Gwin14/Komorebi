import * as Haptics from "expo-haptics";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import styles from "./FocusRangeSlider.styles";

const INSET = 20;
export default function FocusRangeSlider({
  limits,
  activeEndpoint,
  onChange,
  disabled,
  topBarBelow,
}) {
  const [width, setWidth] = useState(0);
  const current = useRef({
    limits,
    activeEndpoint,
    onChange,
    disabled,
    topBarBelow,
  });
  current.current = { limits, activeEndpoint, onChange, disabled };
  const drag = useRef(null);
  const trackRef = useRef(null);
  const gestureId = useRef(0);
  const span = Math.max(1, width - INSET * 2);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !current.current.disabled,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !current.current.disabled &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event) => {
          const id = ++gestureId.current;
          const pageX = event.nativeEvent.pageX;
          // locationX can be relative to a thumb or tick, so measure the track.
          trackRef.current?.measureInWindow((trackX) => {
            if (id !== gestureId.current || current.current.disabled) return;
            const {
              limits: range,
              activeEndpoint: active,
              onChange: change,
            } = current.current;
            const touch = (pageX - trackX - INSET) / span;
            const nearDistance = Math.abs(touch - range.near);
            const farDistance = Math.abs(touch - range.far);
            const endpoint =
              Math.abs(nearDistance - farDistance) < 0.015
                ? active === "near"
                  ? "far"
                  : "near"
                : nearDistance < farDistance
                  ? "near"
                  : "far";
            drag.current = {
              endpoint,
              start: range[endpoint],
              tick: Math.round(range[endpoint] * 40),
            };
            change(endpoint, range[endpoint]);
            void Haptics.selectionAsync().catch(() => {});
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (!drag.current || current.current.disabled) return;
          const { endpoint, start } = drag.current;
          const value = Math.max(0, Math.min(1, start + gesture.dx / span));
          current.current.onChange(endpoint, value);
          const tick = Math.round(current.current.limits[endpoint] * 40);
          if (tick !== drag.current.tick) {
            drag.current.tick = tick;
            void Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderRelease: () => {
          drag.current = null;
        },
        onPanResponderTerminate: () => {
          gestureId.current += 1;
          drag.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [span],
  );
  const handle = (endpoint, label) => (
    <View
      key={endpoint}
      style={[
        styles.handle,
        { left: INSET + limits[endpoint] * span - 10 },
        activeEndpoint === endpoint && styles.activeHandle,
      ]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Foco ${label.toLowerCase()}`}
      accessibilityState={{ disabled, selected: activeEndpoint === endpoint }}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(limits[endpoint] * 100),
      }}
      accessibilityActions={[
        { name: "activate", label: `Mostrar foco ${label.toLowerCase()}` },
        { name: "increment" },
        { name: "decrement" },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (disabled) return;
        const delta =
          nativeEvent.actionName === "increment"
            ? 0.01
            : nativeEvent.actionName === "decrement"
              ? -0.01
              : 0;
        onChange(endpoint, limits[endpoint] + delta);
      }}
    >
      <View
        style={[
          styles.handleNeedle,
          activeEndpoint === endpoint && styles.activeNeedle,
        ]}
      />
      <View
        style={[
          styles.handleGrip,
          activeEndpoint === endpoint && styles.activeGrip,
        ]}
      />
    </View>
  );
  return (
    <View
      style={[
        styles.container,
        topBarBelow && styles.containerBelow,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.labels, topBarBelow && styles.labelsBelow]}>
        <Text
          style={[
            styles.label,
            activeEndpoint === "near" && styles.selectedLabel,
          ]}
        >
          Perto · {Math.round(limits.near * 100)}%
        </Text>
        <Text
          style={[
            styles.label,
            activeEndpoint === "far" && styles.selectedLabel,
          ]}
        >
          Longe · {Math.round(limits.far * 100)}%
        </Text>
      </View>
      <View
        ref={trackRef}
        collapsable={false}
        style={styles.ruler}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View
          pointerEvents="none"
          style={[
            styles.range,
            {
              left: INSET + limits.near * span,
              width: (limits.far - limits.near) * span,
            },
          ]}
        />
        <View pointerEvents="none" style={styles.ticks}>
          {Array.from({ length: 41 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.tick,
                { left: INSET + (index * span) / 40 - 0.5 },
                index % 5 === 0 && styles.majorTick,
                index / 40 >= limits.near &&
                  index / 40 <= limits.far &&
                  styles.rangeTick,
              ]}
            />
          ))}
        </View>
        {handle("near", "Próximo")}
        {handle("far", "Distante")}
      </View>
    </View>
  );
}
