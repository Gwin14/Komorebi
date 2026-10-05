import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { TOP_BAR_CONTROLS } from "../utils/topBarControls";
import styles, { ROW_HEIGHT } from "./TopBarControlList.styles";

const controlsById = Object.fromEntries(TOP_BAR_CONTROLS.map((item) => [item.id, item]));

function Handle({ label, onStart, onMove, onEnd, onCancel, onAccessibilityAction }) {
  const callbacks = useRef();
  callbacks.current = { onStart, onMove, onEnd, onCancel };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => callbacks.current.onStart(),
    onPanResponderMove: (_, gesture) => callbacks.current.onMove(gesture.dy),
    onPanResponderRelease: () => callbacks.current.onEnd(),
    onPanResponderTerminate: () => callbacks.current.onCancel(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <View
      {...responder.panHandlers}
      style={styles.handle}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Ordem de ${label}`}
      accessibilityHint="Arraste para cima ou para baixo para reordenar."
      accessibilityActions={[{ name: "increment", label: "Mover para baixo" }, { name: "decrement", label: "Mover para cima" }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <Ionicons name="reorder-three-outline" size={25} color="#777" />
    </View>
  );
}

export default function TopBarControlList({ controls, onChange, onRemove, onDragStateChange }) {
  const [drag, setDrag] = useState(null);
  const currentDrag = useRef(null);
  const start = (id) => {
    const next = { id, from: controls.indexOf(id), to: controls.indexOf(id), dy: 0, order: [...controls] };
    currentDrag.current = next;
    setDrag(next);
    onDragStateChange?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const move = (dy) => {
    const previous = currentDrag.current;
    if (!previous) return;
    const bounded = Math.max(-previous.from * ROW_HEIGHT, Math.min((previous.order.length - 1 - previous.from) * ROW_HEIGHT, dy));
    const to = previous.from + Math.round(bounded / ROW_HEIGHT);
    const next = { ...previous, dy: bounded, to };
    currentDrag.current = next;
    setDrag(next);
    if (to !== previous.to) void Haptics.selectionAsync().catch(() => {});
  };
  const finish = (commit) => {
    const active = currentDrag.current;
    currentDrag.current = null;
    setDrag(null);
    onDragStateChange?.(false);
    if (commit && active && active.from !== active.to) {
      const next = [...active.order];
      next.splice(active.from, 1);
      next.splice(active.to, 0, active.id);
      onChange(next);
    }
  };
  const reorder = (index, offset) => {
    const to = index + offset;
    if (to < 0 || to >= controls.length) return;
    const next = [...controls];
    const [id] = next.splice(index, 1);
    next.splice(to, 0, id);
    onChange(next);
  };
  return (
    <View style={[styles.list, { height: controls.length * ROW_HEIGHT + 2 }]}>
      {controls.map((id, index) => {
        const control = controlsById[id];
        const active = drag?.id === id;
        let position = index;
        if (drag && !active) {
          if (index > drag.from && index <= drag.to) position -= 1;
          if (index < drag.from && index >= drag.to) position += 1;
        }
        return (
          <View key={id} style={[styles.row, { top: position * ROW_HEIGHT }, index === controls.length - 1 && styles.lastRow, active && [styles.activeRow, { top: drag.from * ROW_HEIGHT, transform: [{ translateY: drag.dy }] }]]}>
            <View style={styles.icon}>
              <Ionicons name={control.icon} size={19} color="#ffaa00" />
            </View>
            <View style={styles.text}>
              <Text style={styles.label}>{control.label}</Text>
              {id === "settings" && <Text style={styles.subtitle}>Sempre disponível</Text>}
            </View>
            {id !== "settings" && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${control.label}`} onPress={() => onRemove(id)} disabled={!!drag} style={styles.remove}>
                <Ionicons name="close" size={18} color="#ff7474" />
              </Pressable>
            )}
            <Handle label={control.label} onStart={() => start(id)} onMove={move} onEnd={() => finish(true)} onCancel={() => finish(false)} onAccessibilityAction={(event) => reorder(index, event.nativeEvent.actionName === "increment" ? 1 : -1)} />
          </View>
        );
      })}
    </View>
  );
}
