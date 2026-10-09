import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import styles from "./PhotoDepthScan.styles";

export default function PhotoDepthScan({ uri, onComplete }) {
  const progress = useRef(new Animated.Value(0)).current;
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const [height, setHeight] = useState(0);
  const [loaded, setLoaded] = useState(!uri);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (loaded) return;
    // A missing preview must not prevent the scan or the panel from returning.
    const timeout = setTimeout(() => {
      setImageFailed(true);
      setLoaded(true);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [loaded]);

  useEffect(() => {
    if (!height || !loaded) return;
    let disposed = false;
    let animation;
    const finish = () => {
      if (!disposed) completeRef.current();
    };
    // Skip the moving overlay when the system requests reduced motion.
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (disposed) return;
      if (reduced) {
        console.info("[PhotoDepthScan] animação omitida por Reduzir Movimento");
        finish();
        return;
      }
      console.info("[PhotoDepthScan] animação iniciada", { height, hasDepthPreview: !!uri && !imageFailed });
      progress.setValue(0);
      animation = Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(200),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      animation.start(({ finished }) => { if (finished) finish(); });
    }).catch(finish);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (reduced) => {
      if (reduced) { animation?.stop(); finish(); }
    });
    return () => {
      disposed = true;
      animation?.stop();
      subscription.remove();
    };
  }, [height, loaded, progress, uri, imageFailed]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, { opacity: height > 0 && loaded ? 1 : 0 }]}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <Animated.View style={[styles.mask, (!uri || imageFailed) && styles.fallbackMask, {
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-height, 0] }) }],
      }]}>
        <Animated.View style={[styles.overlay, {
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
        }]}>
          {uri && !imageFailed && <Image
            source={{ uri }}
            resizeMode="cover"
            style={styles.overlay}
            onLoad={() => setLoaded(true)}
            onError={() => { setImageFailed(true); setLoaded(true); }}
          />}
          <View style={styles.tint} />
        </Animated.View>
      </Animated.View>
      {loaded && height > 0 && (
        <Animated.View style={[styles.beam, {
          opacity: progress.interpolate({ inputRange: [0, 0.025, 0.975, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: Animated.multiply(progress, height) }],
        }]}>
          <LinearGradient colors={["transparent", "rgba(255,190,75,0.35)", "transparent"]} style={styles.glow} />
          <View style={styles.line} />
        </Animated.View>
      )}
    </View>
  );
}
