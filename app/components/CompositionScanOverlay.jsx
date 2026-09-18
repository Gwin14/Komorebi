import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { SCAN_ENTER_DURATION, SCAN_EXIT_DURATION } from "../utils/compositionScanSession";
import styles from "./CompositionScanOverlay.styles";

export default function CompositionScanOverlay({ scan, layout }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scanProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scan.busy) {
      scanProgress.setValue(0);
    } else {
      scanProgress.stopAnimation();
      scanProgress.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(scanProgress, {
        toValue: 1,
        duration: 1650,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [scan.busy, scanProgress]);
  useEffect(() => {
    opacity.stopAnimation();
    if (!scan.result || scan.busy) { opacity.setValue(0); return; }
    const animation = Animated.timing(opacity, {
      toValue: scan.phase === "leaving" ? 0 : 1,
      duration: scan.phase === "leaving" ? SCAN_EXIT_DURATION : SCAN_ENTER_DURATION,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, scan.busy, scan.result, scan.phase]);

  const { width, height } = layout;
  const scanTravel = scanProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, height - 76)],
  });
  const startScan = useCallback(() => {
    console.log("[CompositionScan] JS overlay-press", {
      canScan: scan.canScan,
      busy: scan.busy,
    });
    if (!scan.canScan || scan.busy) return;
    console.log("[CompositionScan] JS scan-start-dispatch");
    scan.start();
  }, [scan]);
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
  if (!scan.enabled) return null;

  return (
    <>
      {scan.busy && (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanBeam, { transform: [{ translateY: scanTravel }] }]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,170,0,0.04)", "rgba(255,170,0,0.28)"]}
            locations={[0, 0.52, 1]}
            style={styles.scanGlow}
          />
          <View style={styles.scanLine} />
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
        accessibilityHint="Mostra um enquadramento sugerido até o alinhamento"
        accessibilityLabel={scan.preparing ? "Preparando scanner" : "Analisar composição"}
        accessibilityState={{ disabled: !scan.canScan || scan.busy, busy: scan.busy || scan.preparing }}
        disabled={!scan.canScan || scan.busy || scan.preparing}
        onPress={startScan}
        style={({ pressed }) => [
          styles.button,
          (!scan.canScan || scan.preparing) && styles.disabled,
          pressed && styles.buttonPressed,
        ]}
      >
        {scan.busy || scan.preparing ? (
          <>
            <ActivityIndicator size="small" color="#ffaa00" />
            <Text style={styles.preparingLabel}>
              {scan.preparing ? "Preparando scanner" : "Analisando"}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.buttonIcon}>
              <Ionicons color="#171000" name="scan-outline" size={17} />
            </View>
            <Text style={styles.label}>SCAN</Text>
          </>
        )}
      </Pressable>
    </>
  );
}
