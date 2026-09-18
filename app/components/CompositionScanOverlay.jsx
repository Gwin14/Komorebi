import { LiquidGlassView } from "@uginy/react-native-liquid-glass";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, UIManager, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
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
    console.log("[CompositionScan] JS overlay-press", {
      canScan: scan.canScan,
      busy: scan.busy,
    });
    if (!scan.canScan || scan.busy) return;
    const backdropStartedAt = Date.now();
    try {
      console.log("[CompositionScan] JS backdrop-capture-start");
      const uri = await captureBackdrop?.();
      console.log("[CompositionScan] JS backdrop-capture-result", {
        elapsedMs: Date.now() - backdropStartedAt,
        hasUri: Boolean(uri),
      });
      if (uri) {
        setBackdropUri(uri);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } catch (error) {
      if (__DEV__) console.warn("[CompositionScan] Unable to capture glass backdrop", error);
    }
    console.log("[CompositionScan] JS scan-start-dispatch");
    scan.start();
  }, [captureBackdrop, scan]);
  const draw = (gizmo, shadow) => {
    const stroke = shadow ? "rgba(0,0,0,0.72)" : "#FFAA00";
    if (gizmo.type === "framing") {
      return (
        <Rect
          key={`${gizmo.id}-${shadow}`}
          x={gizmo.rect.x * width}
          y={gizmo.rect.y * height}
          width={gizmo.rect.width * width}
          height={gizmo.rect.height * height}
          rx={4}
          fill="none"
          stroke={stroke}
          strokeWidth={shadow ? 5 : 1.8}
        />
      );
    }
    return null;
  };
  const framing = scan.result?.gizmos.find((gizmo) => gizmo.type === "framing");
  const cameraCenter = { x: width / 2, y: height / 2 };
  const framingCenter = framing ? {
    x: (framing.rect.x + framing.rect.width / 2) * width,
    y: (framing.rect.y + framing.rect.height / 2) * height,
  } : null;
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
        <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]}>
          {scan.result.gizmos.length > 0 && (
            <Svg
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              width={width}
              height={height}
            >
              {framingCenter && (
                <>
                  <Line
                    x1={cameraCenter.x}
                    y1={cameraCenter.y}
                    x2={framingCenter.x}
                    y2={framingCenter.y}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={3}
                    strokeDasharray="4 6"
                  />
                  <Line
                    x1={cameraCenter.x}
                    y1={cameraCenter.y}
                    x2={framingCenter.x}
                    y2={framingCenter.y}
                    stroke="rgba(255,255,255,0.58)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                </>
              )}
              {scan.result.gizmos.map((g) => draw(g, true))}
              {scan.result.gizmos.map((g) => draw(g, false))}
              {framingCenter && (
                <>
                  <Circle
                    cx={cameraCenter.x}
                    cy={cameraCenter.y}
                    r={5}
                    fill="rgba(0,0,0,0.48)"
                    stroke="rgba(255,255,255,0.92)"
                    strokeWidth={1.5}
                  />
                  <Circle
                    cx={framingCenter.x}
                    cy={framingCenter.y}
                    r={5}
                    fill="rgba(255,170,0,0.9)"
                    stroke="rgba(0,0,0,0.72)"
                    strokeWidth={1.5}
                  />
                </>
              )}
            </Svg>
          )}
          <View
            accessible
            accessibilityLabel={scan.result.message}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
            style={styles.statusContainer}
          >
            <View style={styles.statusPill}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.statusText}>
                {scan.result.message}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Analisar composição"
        accessibilityHint="Mostra um enquadramento sugerido até o alinhamento"
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
