import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { Dimensions, PanResponder, StyleSheet, Text, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Largura da área da régua (ajuste conforme o seu layout)
const DIAL_WIDTH = SCREEN_WIDTH * 0.6;
const TICK_SPACING = 15; // Espaço em pixels entre cada tracinho da régua

export default function ExposureSlider({
  exposure,
  setExposure,
  minExposure = -2,
  maxExposure = 2,
  topBarBelow,
}) {
  const exposureRef = useRef(exposure);
  const exposureStart = useRef(exposure);
  const lastHapticStep = useRef(Math.round(exposure * 10));

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
        // Arrasto horizontal
        const delta = -gestureState.dx * 0.015;

        let nextExposure = exposureStart.current + delta;

        nextExposure = Math.max(
          minExposure,
          Math.min(maxExposure, nextExposure),
        );

        const roundedExposure = Number(nextExposure.toFixed(2));

        // Haptic por “clique” da régua
        const currentStep = Math.round(roundedExposure * 10);

        if (currentStep !== lastHapticStep.current) {
          lastHapticStep.current = currentStep;

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        }

        exposureRef.current = roundedExposure;
        setExposure(roundedExposure);
      },
      onPanResponderRelease: (_, gestureState) => {
        const wasTap =
          Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;

        if (wasTap) {
          exposureRef.current = 0;
          exposureStart.current = 0;
          lastHapticStep.current = 0;

          setExposure(0);

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

          return;
        }

        exposureStart.current = exposureRef.current;
      },
    }),
  ).current;

  // Renderiza os tracinhos da régua dinamicamente
  const renderTicks = () => {
    const ticks = [];
    // Criamos uma quantidade de traços baseada no range da exposição
    // Multiplicando por 10 para ter marcações quebradas (ex: -2.0, -1.9, -1.8...)
    const startTick = minExposure * 10;
    const endTick = maxExposure * 10;

    for (let i = startTick; i <= endTick; i++) {
      const isMajor = i % 5 === 0; // Traco maior a cada 0.5 unidades
      const isCenter = i === 0; // Destaque para o zero absoluto

      ticks.push(
        <View
          key={i}
          style={[
            styles.tick,
            isMajor ? styles.majorTick : styles.minorTick,
            isCenter && styles.centerTickStyle,
            {
              marginRight: i === endTick ? 0 : TICK_SPACING,
            },
          ]}
        />,
      );
    }
    return ticks;
  };

  // Cálculo para mover a régua baseado no valor atual do exposure
  // Quanto maior o valor, mais para a esquerda a régua se move (offset negativo)
  const range = maxExposure - minExposure;
  const currentProgress = (exposure - minExposure) / range;

  // Cada 0.1 EV equivale a um tracinho
  const tickIndex = (exposure - minExposure) * 10;

  // Centraliza exatamente o tracinho atual no indicador
  const translateX = DIAL_WIDTH / 2 - tickIndex * (TICK_SPACING + 1.7);

  return (
    <View style={[styles.container, topBarBelow && { marginVertical: -5 }]}>
      {/* Texto com o valor atual em cima */}
      {!topBarBelow && (
        <Text style={styles.exposureText}>
          {exposure > 0 ? "+" : ""}
          {exposure.toFixed(1)} EV
        </Text>
      )}

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
          {exposure > 0 ? "+" : ""}
          {exposure.toFixed(1)} EV
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  exposureText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    fontVariant: ["tabular-nums"], // Evita o texto de "tremer" mudando de largura
    letterSpacing: 0.5,
  },
  exposureTextBelow: {
    marginTop: 8,
    marginBottom: 0,
  },
  dialContainer: {
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    overflow: "hidden", // Mantém os traços fora do limite invisíveis
    justifyContent: "center",
    alignItems: "flex-start", // Alinha no início para o translateX fazer sentido
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  ruleTrack: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    paddingLeft: 0,
    paddingRight: 0,
  },
  tick: {
    width: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 1,
  },
  minorTick: {
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  majorTick: {
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    width: 2,
  },
  centerTickStyle: {
    backgroundColor: "#FFD700", // Um toque sutil de dourado/amarelo no zero (opcional)
    height: 22,
  },
  centerIndicator: {
    position: "absolute",
    left: "50%",
    marginLeft: -1, // Metade da largura para alinhar perfeitamente no centro
    width: 2,
    height: 28,
    backgroundColor: "#FF3B30", // Vermelho clássico estilo leica/agulha de câmera
    borderRadius: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
  },
});
