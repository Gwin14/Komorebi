import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Dimensions,
  PanResponder,
  Text,
  View
} from "react-native";
import styles from "./ExposureSlider.styles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Largura da área da régua (ajuste conforme o seu layout)
const DIAL_WIDTH = SCREEN_WIDTH * 0.6;
const TICK_SPACING = 15; // Espaço em pixels entre cada tracinho da régua
const TICKS_COUNT = 41; // ímpar, para ter um tracinho centralizado

function defaultFormatLabel(value, unit) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} ${unit}`;
}

export default function ExposureSlider({
  exposure,
  setExposure,
  minExposure = -2,
  maxExposure = 2,
  topBarBelow,
  resetValue = 0,
  formatLabel,
  unit = "EV",
}) {
  const exposureRef = useRef(exposure);
  const exposureStart = useRef(exposure);
  const lastHapticStep = useRef(0);

  const progressFor = (v) => {
    if (maxExposure === minExposure) return 0.5;
    return Math.min(
      1,
      Math.max(0, (v - minExposure) / (maxExposure - minExposure)),
    );
  };

  const valueFor = (progress) => minExposure + progress * (maxExposure - minExposure);

  const exposurePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        exposureStart.current = exposureRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const startProgress = progressFor(exposureStart.current);
        const deltaProgress = -gestureState.dx / DIAL_WIDTH;
        const nextProgress = Math.min(1, Math.max(0, startProgress + deltaProgress));
        const nextExposure = valueFor(nextProgress);

        // Haptic por “clique” da régua
        const currentStep = Math.round(nextProgress * (TICKS_COUNT - 1));

        if (currentStep !== lastHapticStep.current) {
          lastHapticStep.current = currentStep;

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        }

        exposureRef.current = nextExposure;
        setExposure(nextExposure);
      },
      onPanResponderRelease: (_, gestureState) => {
        const wasTap =
          Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;

        if (wasTap) {
          exposureRef.current = resetValue;
          exposureStart.current = resetValue;
          lastHapticStep.current = Math.round(
            progressFor(resetValue) * (TICKS_COUNT - 1),
          );

          setExposure(resetValue);

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

          return;
        }

        exposureStart.current = exposureRef.current;
      },
    }),
  ).current;

  // Renderiza os tracinhos da régua (quantidade fixa, independente do range)
  const renderTicks = () => {
    const ticks = [];
    const centerIndex = Math.floor(TICKS_COUNT / 2);

    for (let i = 0; i < TICKS_COUNT; i++) {
      const isMajor = i % 5 === 0;
      const isCenter = i === centerIndex;

      ticks.push(
        <View
          key={i}
          style={[
            styles.tick,
            isMajor ? styles.majorTick : styles.minorTick,
            isCenter && styles.centerTickStyle,
            {
              marginRight: i === TICKS_COUNT - 1 ? 0 : TICK_SPACING,
            },
          ]}
        />,
      );
    }
    return ticks;
  };

  // Cálculo para mover a régua baseado no valor atual do exposure
  const progress = progressFor(exposure);
  const tickIndex = progress * (TICKS_COUNT - 1);
  const translateX = DIAL_WIDTH / 2 - tickIndex * (TICK_SPACING + 1.7);

  const label = formatLabel
    ? formatLabel(exposure)
    : defaultFormatLabel(exposure, unit);

  return (
    <View style={[styles.container, topBarBelow && { marginVertical: -5 }]}>
      {/* Texto com o valor atual em cima */}
      {!topBarBelow && <Text style={styles.exposureText}>{label}</Text>}

      {/* Área sensível ao toque */}
      <View
        style={[styles.dialContainer, { width: DIAL_WIDTH }]}
        {...exposurePanResponder.panHandlers}
      >
        {/* A Régua que se move */}
        <View style={[styles.ruleTrack, { transform: [{ translateX }] }]}>
          {renderTicks()}
        </View>

        {/* Marcador Central Fixo (A agulha da régua) */}
        <View style={styles.centerIndicator} pointerEvents="none" />
      </View>
      {topBarBelow && (
        <Text style={[styles.exposureText, styles.exposureTextBelow]}>
          {label}
        </Text>
      )}
    </View>
  );
}
