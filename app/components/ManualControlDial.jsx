import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { Animated, PanResponder, View } from "react-native";
import styles from "./ManualControlDial.styles";

const ITEM_SPACING = 36;
const DIAL_WIDTH = 108;

export default function ManualControlDial({ options, selectedId, onSelect }) {
  const selectedIndex = options.findIndex((option) => option.id === selectedId);
  const position = useRef(new Animated.Value(selectedIndex)).current;
  const dragStart = useRef(selectedIndex);
  const currentPosition = useRef(selectedIndex);
  const lastSelectedIndex = useRef(selectedIndex);

  const selectIndex = useCallback(
    (index) => {
      if (index === lastSelectedIndex.current) return;
      lastSelectedIndex.current = index;
      onSelect(options[index].id);
      Haptics.selectionAsync().catch(() => {});
    },
    [onSelect, options],
  );

  const clamp = useCallback(
    (value) => Math.max(0, Math.min(options.length - 1, value)),
    [options.length],
  );

  const snapTo = useCallback(
    (value) => {
      const index = Math.round(clamp(value));
      currentPosition.current = index;
      selectIndex(index);
      Animated.spring(position, {
        toValue: index,
        stiffness: 240,
        damping: 28,
        mass: 1,
        useNativeDriver: false,
      }).start();
    },
    [clamp, position, selectIndex],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            dragStart.current = value;
            currentPosition.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = clamp(dragStart.current - gesture.dx / ITEM_SPACING);
          currentPosition.current = next;
          position.setValue(next);
          selectIndex(Math.round(next));
        },
        onPanResponderRelease: (event, gesture) => {
          const wasTap = Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5;
          const target = wasTap
            ? dragStart.current +
              (event.nativeEvent.locationX - DIAL_WIDTH / 2) / ITEM_SPACING
            : currentPosition.current;
          snapTo(target);
        },
        onPanResponderTerminate: () => snapTo(currentPosition.current),
      }),
    [clamp, position, selectIndex, snapTo],
  );

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Ajuste manual"
      accessibilityValue={{
        min: 0,
        max: options.length - 1,
        now: selectedIndex,
        text: options[selectedIndex].label,
      }}
      accessibilityActions={[
        { name: "increment", label: "Próximo ajuste" },
        { name: "decrement", label: "Ajuste anterior" },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") snapTo(selectedIndex + 1);
        if (nativeEvent.actionName === "decrement") snapTo(selectedIndex - 1);
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.selectionMarker} pointerEvents="none" />
      <View style={styles.items} pointerEvents="none">
        {options.map((option, index) => {
          const inputRange = [
            index - 1.5,
            index - 1,
            index,
            index + 1,
            index + 1.5,
          ];

          return (
            <Animated.Text
              key={option.id}
              style={[
                styles.label,
                selectedId === option.id && styles.labelActive,
                {
                  opacity: position.interpolate({
                    inputRange,
                    outputRange: [0, 0.35, 1, 0.35, 0],
                    extrapolate: "clamp",
                  }),
                  transform: [
                    {
                      translateX: position.interpolate({
                        inputRange: [0, options.length - 1],
                        outputRange: [
                          index * ITEM_SPACING,
                          (index - options.length + 1) * ITEM_SPACING,
                        ],
                      }),
                    },
                    {
                      scale: position.interpolate({
                        inputRange,
                        outputRange: [0.55, 0.7, 1, 0.7, 0.55],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            >
              {option.label}
            </Animated.Text>
          );
        })}
      </View>
    </View>
  );
}
