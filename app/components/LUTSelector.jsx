import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Canvas, ColorMatrix, Fill, FractalNoise } from "@shopify/react-native-skia";
import React from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Shutter from "./shutter";
import styles from "./LUTSelector.styles";

const ACCENT = "#ffaa00";
const LUT_GRADIENTS = {
  none: ["#c7c7c3", "#777773", "#292929"],
  filtro1: ["#254d32", "#73a942", "#d8bf45"],
  filtro2: ["#fff06a", "#f7b32b", "#e76f00"],
  filtro3: ["#172554", "#4452a3", "#9b72cf"],
  filtro4: ["#ff4f87", "#db2777", "#7f1d4e"],
  filtro5: ["#ffcc80", "#e8874a", "#9f4937"],
  filtro6: ["#172d33", "#3c6970", "#d4945b"],
  filtro7: ["#40203f", "#773b73", "#c16a9d"],
  filtro8: ["#fff2a6", "#f5cb42", "#bd7925"],
};
const CUSTOM_GRADIENTS = [
  ["#315c72", "#6a8d92", "#e6c79c"],
  ["#4d194d", "#893168", "#e56b6f"],
  ["#386641", "#6a994e", "#dda15e"],
  ["#3d405b", "#81739d", "#f2cc8f"],
  ["#264653", "#2a9d8f", "#e9c46a"],
];
const GRAIN_PREVIEW_OPACITY = { soft: 0.18, medium: 0.32, strong: 0.48 };
const GRAYSCALE = [
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
];
const HALATION_PREVIEWS = {
  none: ["#777", "#333", "#181818"],
  soft: ["#fff7dc", "#c87555", "#2a1715"],
  medium: ["#fff4cf", "#eb7149", "#421713"],
  strong: ["#fff0bd", "#ff5730", "#64140d"],
};
const TABS = [
  { id: "filter", label: "Filtros", icon: "color-filter-outline" },
  { id: "grain", label: "Grão", icon: "scan-outline" },
  { id: "halation", label: "Halation", icon: "sunny-outline" },
];

const getLutGradient = (lut) => {
  if (LUT_GRADIENTS[lut.id]) return LUT_GRADIENTS[lut.id];
  const hash = [...lut.name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return CUSTOM_GRADIENTS[hash % CUSTOM_GRADIENTS.length];
};
const optionName = (option) => option.id === "none" ? "Desligado" : option.name;

function FilterPreview({ option }) {
  return (
    <LinearGradient colors={getLutGradient(option)} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.preview}>
      <View style={styles.previewSheen} />
      {option.id === "none" && <Ionicons name="remove-outline" size={24} color="rgba(255,255,255,0.82)" />}
    </LinearGradient>
  );
}

function GrainPreview({ option }) {
  return (
    <LinearGradient colors={["#aaa9a3", "#555550", "#202020"]} style={styles.preview}>
      {option.id !== "none" && (
        <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: GRAIN_PREVIEW_OPACITY[option.id] }]}>
          <Fill>
            <FractalNoise freqX={0.65} freqY={0.65} octaves={1} seed={7} />
            <ColorMatrix matrix={GRAYSCALE} />
          </Fill>
        </Canvas>
      )}
      {option.id === "none" && <Ionicons name="remove-outline" size={24} color="rgba(255,255,255,0.82)" />}
    </LinearGradient>
  );
}

function HalationPreview({ option }) {
  return (
    <View style={[styles.preview, styles.halationPreview]}>
      <LinearGradient colors={HALATION_PREVIEWS[option.id] || HALATION_PREVIEWS.none} locations={[0, 0.38, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.halationGlow} />
      {option.id === "none" && <Ionicons name="remove-outline" size={24} color="rgba(255,255,255,0.82)" />}
    </View>
  );
}

function OptionCard({ option, selected, type, onPress }) {
  const Preview = type === "filter" ? FilterPreview : type === "grain" ? GrainPreview : HalationPreview;
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${TABS.find((tab) => tab.id === type)?.label} ${option.name}`}
      accessibilityState={{ selected }}
    >
      <View style={styles.previewFrame}>
        <Preview option={option} />
        {selected && (
          <View style={styles.selectedMark}>
            <Ionicons name="checkmark" size={11} color="#15120b" />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.optionName, selected && styles.optionNameSelected]}>{optionName(option)}</Text>
    </TouchableOpacity>
  );
}

export default function LUTSelector({
  selectedLutId, onSelectLut, selectedGrainId, onSelectGrain,
  selectedHalationId, onSelectHalation, visible, availableLuts,
  availableGrains, availableHalations, takePicture, isProcessing, capturing,
}) {
  const [activeTab, setActiveTab] = React.useState("filter");
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 1 : 0, duration: 260, useNativeDriver: true }).start();
  }, [slideAnim, visible]);

  if (!visible) return null;

  const sections = {
    filter: { options: availableLuts, selectedId: selectedLutId, select: onSelectLut },
    grain: { options: availableGrains, selectedId: selectedGrainId, select: onSelectGrain },
    halation: { options: availableHalations, selectedId: selectedHalationId, select: onSelectHalation },
  };
  const currentSection = sections[activeTab];
  const enabledEffects = [selectedGrainId, selectedHalationId].filter((id) => id !== "none").length;
  const selectTab = (tabId) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);
  };
  const selectOption = (id) => {
    Haptics.selectionAsync();
    currentSection.select(id);
  };

  return (
    <Animated.View style={[styles.container, {
      opacity: slideAnim,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [220, 0] }) }],
    }]}>
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Efeitos da foto</Text>
          </View>
          {enabledEffects > 0 && (
            <View style={styles.activeEffectsBadge}>
              <View style={styles.activeEffectsDot} />
              <Text style={styles.activeEffectsText}>{enabledEffects} {enabledEffects === 1 ? "efeito" : "efeitos"}</Text>
            </View>
          )}
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const effectEnabled = (tab.id === "grain" && selectedGrainId !== "none") || (tab.id === "halation" && selectedHalationId !== "none");
            return (
              <TouchableOpacity key={tab.id} style={[styles.tab, active && styles.tabActive]} onPress={() => selectTab(tab.id)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Ionicons name={tab.icon} size={15} color={active ? ACCENT : "rgba(255,255,255,0.55)"} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                {effectEnabled && !active && <View style={styles.tabStatusDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionsContent}>
          {currentSection.options.map((option) => (
            <OptionCard key={`${activeTab}-${option.id}`} option={option} type={activeTab} selected={currentSection.selectedId === option.id} onPress={() => selectOption(option.id)} />
          ))}
        </ScrollView>
      </View>
      <View style={styles.shutterDivider} />
      <View style={styles.quickShutterSlot}>
        <Shutter takePicture={takePicture} isProcessing={isProcessing} capturing={capturing} compact />
      </View>
    </Animated.View>
  );
}
