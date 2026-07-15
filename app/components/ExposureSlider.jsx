import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Dimensions, PanResponder, Text, View } from "react-native";
import styles from "./ExposureSlider.styles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Largura da área da régua (ajuste conforme o seu layout)
const DIAL_WIDTH = SCREEN_WIDTH * 0.6;
const TICK_SPACING = 15; // Distância visual entre os centros dos tracinhos
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
  // Quando informado, o ajuste tem um modo "auto" (ex.: ISO, obturador, WB,
  // foco). O toque/tap no slider chama onReset() em vez de fixar um valor
  // numérico, e o label exibe "AUTO" enquanto isAuto for true. EV não usa
  // essas props: não tem modo automático, sempre mostra o valor numérico.
  isAuto = false,
  onReset,
  activeControl,
}) {
  const displayValue = isAuto ? resetValue : exposure;

  const exposureRef = useRef(displayValue);
  const exposureStart = useRef(displayValue);
  const lastHapticStep = useRef(0);
  const wasAutoRef = useRef(isAuto);

  useEffect(() => {
    if (wasAutoRef.current !== isAuto) {
      wasAutoRef.current = isAuto;
      exposureRef.current = displayValue;
      exposureStart.current = displayValue;
    }
    // displayValue/resetValue propositalmente fora das deps: só queremos
    // resincronizar a referência na transição de modo, não a cada arraste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuto]);

  const progressFor = useCallback(
    (v) => {
      if (maxExposure === minExposure) return 0.5;
      return Math.min(
        1,
        Math.max(0, (v - minExposure) / (maxExposure - minExposure)),
      );
    },
    [maxExposure, minExposure],
  );

  const valueFor = useCallback(
    (progress) => minExposure + progress * (maxExposure - minExposure),
    [maxExposure, minExposure],
  );

  const exposurePanResponder = useMemo(
    () =>
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
          const nextProgress = Math.min(
            1,
            Math.max(0, startProgress + deltaProgress),
          );
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

            if (onReset) {
              onReset();
            } else {
              setExposure(resetValue);
            }

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            return;
          }

          exposureStart.current = exposureRef.current;
        },
      }),
    [onReset, progressFor, resetValue, setExposure, valueFor],
  );

  // Renderiza os tracinhos da régua (quantidade fixa, independente do range)
  const renderTicks = () => {
    const ticks = [];
    const resetIndex = Math.round(progressFor(resetValue) * (TICKS_COUNT - 1));

    for (let i = 0; i < TICKS_COUNT; i++) {
      const isMajor = i % 5 === 0;
      const isInitialValue = i === resetIndex;

      ticks.push(
        <View key={i} style={[styles.tickSlot, { width: TICK_SPACING }]}>
          <View
            style={[
              styles.tick,
              isMajor ? styles.majorTick : styles.minorTick,
              isInitialValue && styles.centerTickStyle,
            ]}
          />
        </View>,
      );
    }
    return ticks;
  };

  // Cálculo para mover a régua baseado no valor atual do exposure
  const progress = progressFor(displayValue);
  const tickIndex = progress * (TICKS_COUNT - 1);
  const translateX = DIAL_WIDTH / 2 - (tickIndex + 0.5) * TICK_SPACING;

  const label = isAuto
    ? "AUTO"
    : formatLabel
      ? formatLabel(exposure)
      : defaultFormatLabel(exposure, unit);

  return (
    <View
      style={[
        styles.container,
        topBarBelow && { marginVertical: -5 },
        activeControl !== "none" && {
          opacity: 0,
          pointerEvents: "none", // Desativa a interação quando outro controle está ativo
        },
      ]}
    >
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
