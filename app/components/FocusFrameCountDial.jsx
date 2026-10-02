import * as Haptics from "expo-haptics";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { MAX_FOCUS_FRAMES, MIN_FOCUS_FRAMES } from "../utils/focusBracketing";
import styles from "./FocusFrameCountDial.styles";

const SPACING = 34;
const VALUES = Array.from({ length: MAX_FOCUS_FRAMES - MIN_FOCUS_FRAMES + 1 }, (_, i) => MIN_FOCUS_FRAMES + i);
export default function FocusFrameCountDial({ value, onChange, disabled, topBarBelow }) {
  const [width, setWidth] = useState(0);
  const [dragPosition, setDragPosition] = useState(null);
  const current = useRef({ value, onChange, disabled, topBarBelow });
  current.current = { value, onChange, disabled };
  const drag = useRef(null);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !current.current.disabled,
    onMoveShouldSetPanResponder: (_, gesture) => !current.current.disabled && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { drag.current = { start: current.current.value, last: current.current.value }; },
    onPanResponderMove: (_, gesture) => {
      if (!drag.current || current.current.disabled) return;
      const position = Math.max(MIN_FOCUS_FRAMES, Math.min(MAX_FOCUS_FRAMES, drag.current.start - gesture.dx / SPACING));
      setDragPosition(position);
      const next = Math.round(position);
      if (next !== drag.current.last) {
        drag.current.last = next;
        current.current.onChange(next);
        void Haptics.selectionAsync().catch(() => {});
      }
    },
    onPanResponderRelease: () => { drag.current = null; setDragPosition(null); },
    onPanResponderTerminate: () => { drag.current = null; setDragPosition(null); },
    onPanResponderTerminationRequest: () => false,
  }), []);
  const position = dragPosition ?? value;
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {!topBarBelow && <Text style={styles.title}>FOTOS</Text>}
      <View style={styles.dial} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} {...responder.panHandlers}
        accessible accessibilityRole="adjustable" accessibilityLabel="Quantidade de fotos"
        accessibilityState={{ disabled }} accessibilityValue={{ min: MIN_FOCUS_FRAMES, max: MAX_FOCUS_FRAMES, now: value }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (disabled) return;
          onChange(Math.max(MIN_FOCUS_FRAMES, Math.min(MAX_FOCUS_FRAMES, value + (nativeEvent.actionName === "increment" ? 1 : -1))));
        }}>
        <View pointerEvents="none" style={styles.selection} />
        <View pointerEvents="none" style={styles.needle} />
        {VALUES.map((number) => {
          const distance = Math.abs(number - position);
          return (
            <View pointerEvents="none" key={number} style={[styles.numberSlot,
              { left: width / 2 + (number - position) * SPACING - SPACING / 2, opacity: Math.max(0, 1 - distance / 4) }]}>
              <View style={[styles.tick, number === value && styles.selectedTick]} />
              <Text style={[styles.number, number === value && styles.selectedNumber]}>{number}</Text>
            </View>
          );
        })}
      </View>
      {topBarBelow && <Text style={[styles.title, styles.titleBelow]}>FOTOS</Text>}
    </View>
  );
}
