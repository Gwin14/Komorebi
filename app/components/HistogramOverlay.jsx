import { memo, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, {
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { useDeviceOrientationState } from "../hooks/useDeviceOrientation";
import styles from "./HistogramOverlay.styles";

const CHART_WIDTH = 148;
const CHART_HEIGHT = 62;
const CHART_PADDING = 3;
const VIEWFINDER_INSET = 12;

const createHistogramPath = (bins, closePath = false) => {
  if (!bins?.length) return "";

  const usableWidth = CHART_WIDTH - CHART_PADDING * 2;
  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const points = bins.map((value, index) => {
    const x = CHART_PADDING + (index / (bins.length - 1)) * usableWidth;
    const y =
      CHART_HEIGHT - CHART_PADDING -
      Math.max(0, Math.min(1, value)) * usableHeight;

    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const line = `M ${points.join(" L ")}`;
  if (!closePath) return line;

  return `${line} L ${CHART_WIDTH - CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} Z`;
};

function HistogramOverlay({ bins }) {
  const { animatedStyle, orientation } = useDeviceOrientationState();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const linePath = useMemo(() => createHistogramPath(bins), [bins]);
  const fillPath = useMemo(() => createHistogramPath(bins, true), [bins]);
  const isLandscape = Math.abs(orientation) === 90;
  const rotationOffset = isLandscape
    ? (containerSize.width - containerSize.height) / 2
    : 0;
  const positionStyle = {
    top: VIEWFINDER_INSET + rotationOffset,
    right: VIEWFINDER_INSET - rotationOffset,
  };

  const handleLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;

    setContainerSize((currentSize) => {
      if (currentSize.width === width && currentSize.height === height) {
        return currentSize;
      }

      return { width, height };
    });
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[styles.container, positionStyle, animatedStyle]}
    >
      <View style={styles.header}>
        <Text style={styles.label}>LUMA</Text>
        <Text style={styles.liveLabel}>LIVE</Text>
      </View>

      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="histogramFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.58" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
          </LinearGradient>
        </Defs>

        <Line
          x1={CHART_WIDTH / 4}
          y1={0}
          x2={CHART_WIDTH / 4}
          y2={CHART_HEIGHT}
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={1}
        />
        <Line
          x1={CHART_WIDTH / 2}
          y1={0}
          x2={CHART_WIDTH / 2}
          y2={CHART_HEIGHT}
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={1}
        />
        <Line
          x1={(CHART_WIDTH * 3) / 4}
          y1={0}
          x2={(CHART_WIDTH * 3) / 4}
          y2={CHART_HEIGHT}
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={1}
        />

        {fillPath ? <Path d={fillPath} fill="url(#histogramFill)" /> : null}
        {linePath ? (
          <Path
            d={linePath}
            fill="none"
            stroke="rgba(255,255,255,0.94)"
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

export default memo(HistogramOverlay);
