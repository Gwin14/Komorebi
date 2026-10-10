import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import {
  TOP_BAR_CONTROLS,
  TOP_BAR_MAX_CONTROLS,
  normalizeTopBarControls,
} from "../utils/topBarControls";
import { getOnboardingControlPresets } from "../utils/onboardingControlPresets";
import TopBarControlList from "./TopBarControlList";
import styles from "./Welcome.styles";

export default function OnboardingControls({ controls, onChange, onDragStateChange, reduceMotion = false }) {
  const [previewVersion, setPreviewVersion] = useState(0);
  const [personalizing, setPersonalizing] = useState(false);
  const presets = getOnboardingControlPresets();
  const selected = normalizeTopBarControls(controls);
  const activePreset = presets.find((preset) =>
    preset.controls.length === selected.length &&
    preset.controls.every((id, index) => id === selected[index]),
  );

  return (
    <View style={styles.controlsContent}>
      <View accessibilityRole="radiogroup" style={styles.presetList}>
        {presets.map((preset) => {
          const active = !personalizing && activePreset?.id === preset.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={preset.title}
              onPress={() => {
                setPersonalizing(false);
                setPreviewVersion((current) => current + 1);
                onChange([...preset.controls]);
              }}
              style={({ pressed }) => [
                styles.presetCard,
                active && styles.presetCardActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons name={preset.icon} size={21} color={active ? "#ffaa00" : "#a5a39f"} />
              <Text style={[styles.presetTitle, active && styles.presetTitleActive]}>{preset.title}</Text>
              <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? "#ffaa00" : "#77726a"} />
            </Pressable>
          );
        })}
        {!personalizing && (
          <View accessibilityLiveRegion="polite" style={styles.presetSummary}>
            <View style={styles.presetIconRow}>
              {selected.map((id, index) => {
                const control = TOP_BAR_CONTROLS.find((item) => item.id === id);
                return <PresetControlIcon key={`${previewVersion}-${id}`} control={control} index={index} reduceMotion={reduceMotion} />;
              })}
            </View>
            <Text style={styles.presetControlNames}>
              {selected.map((id) => TOP_BAR_CONTROLS.find((control) => control.id === id).label).join(" · ")}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel="Quero uma experiência personalizada"
          accessibilityState={{ checked: personalizing, expanded: personalizing }}
          onPress={() => setPersonalizing(true)}
          style={({ pressed }) => [
            styles.presetCard,
            styles.personalizeCard,
            personalizing && styles.personalizeCardActive,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="create-outline" size={19} color={personalizing ? "#ffaa00" : "#93908b"} />
          <Text style={[styles.personalizeText, personalizing && styles.presetTitleActive]}>Quero uma experiência personalizada</Text>
          <Ionicons name={personalizing ? "radio-button-on" : "radio-button-off"} size={20} color={personalizing ? "#ffaa00" : "#77726a"} />
        </Pressable>
      </View>
      {personalizing && (
        <TopBarCustomizer controls={selected} onChange={onChange} onDragStateChange={onDragStateChange} />
      )}
      <Text style={styles.controlsNote}>Você pode mudar tudo depois em Configurações.</Text>
    </View>
  );
}

function PresetControlIcon({ control, index, reduceMotion }) {
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 18)).current;

  useEffect(() => {
    opacity.setValue(reduceMotion ? 1 : 0);
    translateY.setValue(reduceMotion ? 0 : 18);
    if (reduceMotion) return;

    const delay = index * 70;
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 10, stiffness: 180, mass: 0.7, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, opacity, reduceMotion, translateY]);

  return (
    <Animated.View accessible accessibilityLabel={control.label}
      style={[styles.presetControlIcon, { opacity, transform: [{ translateY }] }]}>
      <Ionicons name={control.icon} size={21} color="#ffaa00" />
    </Animated.View>
  );
}

function TopBarCustomizer({ controls, onChange, onDragStateChange }) {
  const selected = normalizeTopBarControls(controls);
  const available = TOP_BAR_CONTROLS.filter(
    (control) => !selected.includes(control.id),
  );
  const [draggingControl, setDraggingControl] = useState(false);

  const remove = (controlId) => {
    if (controlId === "settings") return;
    onChange(selected.filter((id) => id !== controlId));
  };

  const add = (controlId) => {
    if (selected.length >= TOP_BAR_MAX_CONTROLS) return;
    onChange(normalizeTopBarControls([...selected, controlId]));
  };

  return (
    <ScrollView
      bounces={false}
      overScrollMode="never"
      scrollEnabled={!draggingControl}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.topBarEditorContent}
      style={styles.customizerScroll}
    >
      <View style={styles.topBarCountRow}>
        <Text style={styles.topBarCount}>
          {selected.length}/{TOP_BAR_MAX_CONTROLS}
        </Text>
      </View>

      <Text style={styles.reorderHint}>
        Arraste pela alça à direita para mudar a ordem.
      </Text>
      <TopBarControlList
        controls={selected}
        onChange={onChange}
        onRemove={remove}
        onDragStateChange={(dragging) => {
          setDraggingControl(dragging);
          onDragStateChange(dragging);
        }}
      />

      {available.length > 0 && (
        <>
          <Text style={styles.availableLabel}>ADICIONAR CONTROLES</Text>
          <View style={styles.availableControls}>
            {available.map((control) => {
              const disabled = selected.length >= TOP_BAR_MAX_CONTROLS;
              return (
                <Pressable
                  key={control.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Adicionar ${control.label}`}
                  disabled={disabled}
                  onPress={() => add(control.id)}
                  style={({ pressed }) => [
                    styles.availableControl,
                    disabled && styles.availableControlDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name={control.icon} size={18} color="#ffaa00" />
                  <Text style={styles.availableControlText}>
                    {control.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

