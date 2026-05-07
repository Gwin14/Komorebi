import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import Reanimated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import ExposureDialFinal from "./ExposureDialFinal";
import LUTSelector from "./LUTSelector";
import Shutter from "./shutter";

export default function BottomControls({
  controlsAnim,
  activeControl,
  takePicture,
  setFacing,
  zoom,
  setZoom,
  selectedLutId,
  setSelectedLutId,
  zoomSV,
  minZoom,
  maxZoom,
  onSliderRelease, // 🚀 Recebe a prop vinda do App (index.jsx)
  availableLuts,
  isProcessing,
  processingQueueLength,
}) {
  const router = useRouter();
  const deviceOrientationStyle = useDeviceOrientation();

  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const isBusy = isProcessing || processingQueueLength > 0;

  useEffect(() => {
    let loop;

    if (isBusy) {
      shimmerAnim.setValue(0);

      loop = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      );

      loop.start();
    }

    return () => {
      loop?.stop();
    };
  }, [isBusy]);

  const shutterTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });

  const toolsTranslate = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const toolsOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const shutterOpacity = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.shutterContainer}>
      <Animated.View
        style={[
          styles.shutterRow,
          {
            transform: [{ translateY: shutterTranslate }],
            opacity: shutterOpacity,
          },
        ]}
      >
        <View style={styles.sideButton}>
          <TouchableOpacity
            style={styles.galleryButton}
            onPress={() => {
              router.push("components/Galery");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Reanimated.View
              style={[
                deviceOrientationStyle,
                { width: 32, height: 32, borderRadius: 5, overflow: "hidden" },
              ]}
            >
              <Ionicons name="images-outline" size={32} color="white" />

              {isBusy && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      transform: [
                        {
                          translateX: shimmerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-32, 32],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      "transparent",
                      "rgba(255,255,255,0.4)",
                      "rgba(255,255,255,0.9)",
                      "rgba(255,255,255,0.4)",
                      "transparent",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1 }}
                  />
                </Animated.View>
              )}
            </Reanimated.View>
          </TouchableOpacity>
        </View>

        <View pointerEvents={activeControl === "none" ? "auto" : "none"}>
          <Shutter takePicture={takePicture} isProcessing={isProcessing} />
        </View>

        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
        >
          <Reanimated.View style={deviceOrientationStyle}>
            <Ionicons name="camera-reverse-outline" size={32} color="white" />
          </Reanimated.View>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.toolsContainer,
          {
            transform: [{ translateY: toolsTranslate }],
            opacity: toolsOpacity,
          },
        ]}
        pointerEvents={activeControl !== "none" ? "auto" : "none"}
      >
        {activeControl === "zoom" && (
          <ExposureDialFinal
            value={zoom}
            onChange={(v) => setZoom(v)}
            onRelease={onSliderRelease} // 👈 Passa o fechamento para o Slider
            zoomSV={zoomSV}
            minZoom={minZoom}
            maxZoom={maxZoom}
          />
        )}

        {activeControl === "lut" && (
          <View style={styles.lutSelectorWrapper}>
            <LUTSelector
              selectedLutId={selectedLutId}
              onSelectLut={setSelectedLutId}
              visible={true}
              availableLuts={availableLuts}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shutterContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 54,
  },
  shutterRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    height: 100,
  },
  sideButton: { padding: 10 },
  galleryButton: {
    padding: 10,
    position: "relative",
  },
  toolsContainer: {
    width: "100%",

    justifyContent: "center",
  },
  lutSelectorWrapper: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
