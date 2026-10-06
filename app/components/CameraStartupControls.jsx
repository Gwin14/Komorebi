import { Animated, View } from "react-native";
import bottomStyles from "./BottomControls.styles";
import styles from "./CameraStartupControls.styles";

function Placeholders({ kind, controlCount, lensCount, viewfinderStyle }) {
  if (kind === "viewfinder") {
    return <View style={[styles.viewfinder, viewfinderStyle]} />;
  }
  if (kind === "top") {
    return (
      <View style={styles.topRow}>
        {Array.from({ length: controlCount }, (_, index) => (
          <View key={index} style={[styles.placeholder, styles.topControl]} />
        ))}
      </View>
    );
  }
  if (kind === "adjustment") {
    return (
      <View style={styles.adjustment}>
        <View style={[styles.placeholder, styles.adjustmentTrack]} />
      </View>
    );
  }
  return (
    <View>
      <View style={bottomStyles.shutterRow}>
        <View style={bottomStyles.sideButton}>
          <View style={[bottomStyles.galleryThumbInner, styles.placeholder]} />
        </View>
        <View style={styles.shutter} />
        <View style={bottomStyles.rightControls}>
          <View style={[styles.placeholder, styles.flip]} />
        </View>
      </View>
      {lensCount > 1 && (
        <View style={styles.lenses}>
          {Array.from({ length: lensCount }, (_, index) => (
            <View key={index} style={[styles.placeholder, styles.lens]} />
          ))}
        </View>
      )}
    </View>
  );
}

// Both layers occupy the real controls' layout. Only opacity changes during
// the handoff, so the viewfinder and shutter never move during the fade.
export default function CameraStartupControls({
  startup,
  kind,
  controlCount = 6,
  lensCount = 0,
  style,
  viewfinderStyle,
  children,
}) {
  const isViewfinder = kind === "viewfinder";
  // Once settings are restored, let the native preview appear immediately.
  // Camera readiness still gates the controls, but must not cover live frames.
  const showPlaceholder = isViewfinder ? startup.loading : !startup.complete;
  // Keep the native preview attached and opaque while it initializes. Fade
  // only the mask above it; preview events must not depend on hidden content.
  const ContentView = isViewfinder ? View : Animated.View;
  return (
    <View style={[styles.slot, style]}>
      <ContentView
        pointerEvents={startup.complete ? "auto" : "none"}
        accessibilityElementsHidden={!startup.complete}
        importantForAccessibility={
          startup.complete ? "auto" : "no-hide-descendants"
        }
        style={isViewfinder ? undefined : { opacity: startup.progress }}
      >
        {children}
      </ContentView>
      {showPlaceholder && (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.overlay,
            {
              opacity: Animated.multiply(
                isViewfinder ? 1 : startup.pulse,
                startup.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
              ),
            },
          ]}
        >
          <Placeholders
            kind={kind}
            controlCount={controlCount}
            lensCount={lensCount}
            viewfinderStyle={viewfinderStyle}
          />
        </Animated.View>
      )}
    </View>
  );
}
