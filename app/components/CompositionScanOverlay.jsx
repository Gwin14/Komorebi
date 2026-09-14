import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, Text } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import { SCAN_ENTER_DURATION, SCAN_EXIT_DURATION } from "../utils/compositionScanSession";
import styles from "./CompositionScanOverlay.styles";

export default function CompositionScanOverlay({ scan, layout }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.stopAnimation();
    if (!scan.result) { opacity.setValue(0); return; }
    if (scan.phase === "visible") { opacity.setValue(1); return; }
    if (scan.phase === "entering") opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: scan.phase === "leaving" ? 0 : 1,
      duration: scan.phase === "leaving" ? SCAN_EXIT_DURATION : SCAN_ENTER_DURATION,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, scan.result, scan.phase]);

  const { width, height } = layout;
  const drawLabel = (gizmo) => {
    const label = gizmo.type === "alignment" ? "Nivele a câmera" : "Mova a pessoa aqui";
    const labelWidth = gizmo.type === "alignment" ? 94 : 112;
    const x = gizmo.type === "target" ? gizmo.point.x * width : width / 2;
    const anchorY = gizmo.type === "target" ? gizmo.point.y * height + 19 : height / 2 + 22;
    const y = Math.min(height - 15, Math.max(15, anchorY));
    const left = Math.min(width - labelWidth - 6, Math.max(6, x - labelWidth / 2));
    return (
      <G key={`${gizmo.id}-label`}>
        <Rect x={left} y={y - 10} width={labelWidth} height={19} rx={9.5} fill="rgba(0,0,0,0.58)" />
        <SvgText
          x={left + labelWidth / 2}
          y={y + 3.5}
          fill="rgba(255,255,255,0.92)"
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
    const stroke = shadow ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.9)";
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
    return null;
  };
  return (
    <>
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
        onPress={scan.start}
        style={[styles.button, !scan.canScan && styles.disabled]}
      >
        {scan.busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.label}>Scan</Text>}
      </Pressable>
    </>
  );
}
