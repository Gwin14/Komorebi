import { LiquidGlassView } from "@uginy/react-native-liquid-glass";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, UIManager, View } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import { SCAN_ENTER_DURATION, SCAN_EXIT_DURATION } from "../utils/compositionScanSession";
import styles from "./CompositionScanOverlay.styles";

const hasNativeMaskedView = Boolean(UIManager.getViewManagerConfig?.("RNCMaskedView"));

function LiquidWaveContent({ backdropUri, height, index, inverseLiquidTravel, width }) {
  return (
    <View style={styles.liquidMask}>
      {backdropUri && (
        <Animated.Image
          source={{ uri: backdropUri }}
          resizeMode="cover"
          style={[
            styles.liquidBackdrop,
            {
              width,
              height,
              left: width * 0.1,
              top: 180 + index * 54,
              transform: [{ translateY: inverseLiquidTravel }],
            },
          ]}
        />
      )}
      <LiquidGlassView
        blurRadius={0}
        refractionStrength={0.82 - index * 0.09}
        ior={1.48}
        magnification={1.32 - index * 0.035}
        glassOpacity={0}
        chromaticAberration={0}
        edgeGlowIntensity={0}
        glareIntensity={0}
        borderIntensity={0}
        edgeWidth={0}
        liquidPower={3.4}
        cornerRadius={0}
        shadowOpacity={0}
        style={[styles.liquidRefraction, { width: width * 1.2 }]}
      />
    </View>
  );
}

export default function CompositionScanOverlay({ scan, layout, captureBackdrop }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const liquidProgress = useRef(new Animated.Value(0)).current;
  const [liquidVisible, setLiquidVisible] = useState(false);
  const [backdropUri, setBackdropUri] = useState(null);
  const liquidStartedAt = useRef(0);
  const liquidHideTimer = useRef(null);

  useEffect(() => {
    if (liquidHideTimer.current) clearTimeout(liquidHideTimer.current);
    if (scan.busy) {
      liquidStartedAt.current = Date.now();
      liquidProgress.setValue(0);
      setLiquidVisible(true);
      return;
    }
    if (!liquidStartedAt.current) return;
    const remaining = Math.max(0, 1750 - (Date.now() - liquidStartedAt.current));
    liquidHideTimer.current = setTimeout(() => {
      setLiquidVisible(false);
      liquidStartedAt.current = 0;
      liquidHideTimer.current = null;
    }, remaining);
    return () => {
      if (liquidHideTimer.current) clearTimeout(liquidHideTimer.current);
    };
  }, [liquidProgress, scan.busy]);

  useEffect(() => {
    if (!liquidVisible) {
      liquidProgress.stopAnimation();
      liquidProgress.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(liquidProgress, {
        toValue: 1,
        duration: 1750,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [liquidProgress, liquidVisible]);
  useEffect(() => {
    opacity.stopAnimation();
    if (!scan.result || liquidVisible) { opacity.setValue(0); return; }
    const animation = Animated.timing(opacity, {
      toValue: scan.phase === "leaving" ? 0 : 1,
      duration: scan.phase === "leaving" ? SCAN_EXIT_DURATION : SCAN_ENTER_DURATION,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [liquidVisible, opacity, scan.result, scan.phase]);

  const { width, height } = layout;
  const liquidTravel = liquidProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height + 230],
  });
  const liquidPulse = liquidProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.9, 1, 0.9],
  });
  const inverseLiquidTravel = Animated.multiply(liquidTravel, -1);
  const startScan = useCallback(async () => {
    if (!scan.canScan || scan.busy) return;
    try {
      const uri = await captureBackdrop?.();
      if (uri) {
        setBackdropUri(uri);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } catch (error) {
      if (__DEV__) console.warn("[CompositionScan] Unable to capture glass backdrop", error);
    }
    scan.start();
  }, [captureBackdrop, scan]);
  const drawLabel = (gizmo) => {
    const label = gizmo.label;
    const labelWidth = Math.min(132, Math.max(62, label.length * 5.7 + 16));
    const rect = gizmo.rect;
    const point = gizmo.point;
    const x = point ? point.x * width : rect ? (rect.x + rect.width / 2) * width : width / 2;
    const anchorY = point
      ? point.y * height + 19
      : rect
        ? (rect.y + rect.height) * height + 14
        : height / 2 + 22;
    const y = Math.min(height - 15, Math.max(15, anchorY));
    const left = Math.min(width - labelWidth - 6, Math.max(6, x - labelWidth / 2));
    return (
      <G key={`${gizmo.id}-label`}>
        <Rect
          x={left} y={y - 10} width={labelWidth} height={19} rx={9.5}
          fill="rgba(20,15,2,0.82)" stroke="rgba(255,170,0,0.9)" strokeWidth={0.7}
        />
        <SvgText
          x={left + labelWidth / 2}
          y={y + 3.5}
          fill="#FFD36A"
          fontSize={9.5}
          fontWeight="500"
          textAnchor="middle"
        >
          {label}
        </SvgText>
      </G>
    );
  };
  const draw = (gizmo, shadow) => {
    const stroke = shadow ? "rgba(0,0,0,0.72)" : "#FFAA00";
    const strokeWidth = shadow ? 3.5 : 1.25;
    if (gizmo.type === "alignment") {
      const half = Math.min(width * 0.24, 85);
      const dx = Math.cos(gizmo.angle) * half;
      const dy = Math.sin(gizmo.angle) * half;
      const referenceX = Math.cos(gizmo.referenceAngle ?? 0) * half;
      const referenceY = Math.sin(gizmo.referenceAngle ?? 0) * half;
      return (
        <G key={`${gizmo.id}-${shadow}`} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round">
          <Line x1={width / 2 - referenceX} y1={height / 2 - referenceY} x2={width / 2 + referenceX} y2={height / 2 + referenceY} strokeDasharray="4 6" />
          <Line x1={width / 2 - dx} y1={height / 2 - dy} x2={width / 2 + dx} y2={height / 2 + dy} />
        </G>
      );
    }
    if (gizmo.type === "target") {
      const x = gizmo.point.x * width;
      const y = gizmo.point.y * height;
      return (
        <G key={`${gizmo.id}-${shadow}`} stroke={stroke} strokeWidth={strokeWidth} fill="none">
          <Circle cx={x} cy={y} r={11} />
          <Circle cx={x} cy={y} r={2} />
        </G>
      );
    }
    if (gizmo.type === "look-space") {
      const x = gizmo.point.x * width;
      const y = gizmo.point.y * height;
      const direction = gizmo.direction === "left" ? -1 : 1;
      return (
        <G key={`${gizmo.id}-${shadow}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round">
          <Line x1={x - 24} y1={y} x2={x + 24} y2={y} />
          <Line x1={x + 24 * direction} y1={y} x2={x + 17 * direction} y2={y - 5} />
          <Line x1={x + 24 * direction} y1={y} x2={x + 17 * direction} y2={y + 5} />
        </G>
      );
    }
    if (gizmo.type === "margin" || gizmo.type === "scale") {
      const x = gizmo.rect.x * width;
      const y = gizmo.rect.y * height;
      const rectWidth = gizmo.rect.width * width;
      const rectHeight = gizmo.rect.height * height;
      return (
        <Rect
          key={`${gizmo.id}-${shadow}`}
          x={x} y={y} width={rectWidth} height={rectHeight} rx={6}
          fill="none" stroke={stroke} strokeWidth={strokeWidth}
          strokeDasharray={gizmo.type === "margin" ? "5 4" : "3 5"}
        />
      );
    }
    if (gizmo.type === "center") {
      const x = gizmo.point.x * width;
      const y = gizmo.point.y * height;
      return (
        <G key={`${gizmo.id}-${shadow}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round">
          <Line x1={x} y1={Math.max(10, y - 58)} x2={x} y2={Math.min(height - 10, y + 58)} strokeDasharray="4 5" />
          <Circle cx={x} cy={y} r={8} />
        </G>
      );
    }
    return null;
  };
  return (
    <>
      {liquidVisible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.liquidLayer, { opacity: liquidPulse }]}
        >
          {[0].map((index) => (
            <Animated.View
              key={index}
              style={[
                styles.liquidWave,
                {
                  top: -180 - index * 54,
                  opacity: 1,
                  transform: [
                    { translateY: liquidTravel },
                    { rotate: "0deg" },
                    { scaleX: 1 },
                  ],
                },
              ]}
            >
              {hasNativeMaskedView ? (
                <MaskedView
                  style={styles.liquidMask}
                  maskElement={(
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.2)", "black", "black", "rgba(0,0,0,0.2)", "transparent"]}
                      locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
                      style={styles.liquidMask}
                    />
                  )}
                >
                  <LiquidWaveContent
                    backdropUri={backdropUri}
                    height={height}
                    index={index}
                    inverseLiquidTravel={inverseLiquidTravel}
                    width={width}
                  />
                </MaskedView>
              ) : (
                <View style={styles.liquidMask}>
                  <LiquidWaveContent
                    backdropUri={backdropUri}
                    height={height}
                    index={index}
                    inverseLiquidTravel={inverseLiquidTravel}
                    width={width}
                  />
                </View>
              )}
            </Animated.View>
          ))}
        </Animated.View>
      )}
      {scan.result && (
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.overlay, { opacity }]}>
          <Svg width={width} height={height}>
            {scan.result.gizmos.map((g) => draw(g, true))}
            {scan.result.gizmos.map((g) => draw(g, false))}
            {scan.result.gizmos.map(drawLabel)}
          </Svg>
        </Animated.View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Analisar composição"
        accessibilityHint="Mostra sugestões visuais de composição por cinco segundos"
        accessibilityState={{ disabled: !scan.canScan || scan.busy, busy: scan.busy }}
        disabled={!scan.canScan || scan.busy}
        onPress={startScan}
        style={[styles.button, !scan.canScan && styles.disabled]}
      >
        {scan.busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.label}>Scan</Text>}
      </Pressable>
    </>
  );
}
