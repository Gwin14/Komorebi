import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, TouchableOpacity, View } from "react-native";
import Reanimated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import ExposureDialFinal from "./ExposureDialFinal";
import LensSelector from "./LensSelector";
import LUTSelector from "./LUTSelector";
import Shutter from "./shutter";
import styles from "./BottomControls.styles";

export default function BottomControls({
  controlsAnim,
  activeControl,
  takePicture,
  setFacing,
  zoom,
  setZoom,
  exposure,
  setExposure,
  selectedLutId,
  setSelectedLutId,
  zoomSV,
  minZoom,
  maxZoom,
  onSliderRelease,
  availableLuts,
  isProcessing,
  processingQueueLength,
  // 🆕 Props de lentes
  lenses,
  activeLensId,
  onSelectLens,
  galleryRefreshKey,
}) {
  const router = useRouter();
  const deviceOrientationStyle = useDeviceOrientation();
  const [lastPhotoUri, setLastPhotoUri] = useState(null);

  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const isBusy = isProcessing || processingQueueLength > 0;

  useEffect(() => {
    loadLastPhoto();
  }, [galleryRefreshKey]);

  const loadLastPhoto = async () => {
    try {
      const albums = await MediaLibrary.getAlbumsAsync();

      const komorebiAlbum = albums.find(
        (a) => a.title.toLowerCase() === "komorebi",
      );

      if (!komorebiAlbum) return;

      const photos = await MediaLibrary.getAssetsAsync({
        album: komorebiAlbum,
        mediaType: "photo",
        first: 1,
        sortBy: [["creationTime", false]],
      });

      if (photos.assets.length > 0) {
        setLastPhotoUri(photos.assets[0].uri);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let loop;

    if (isBusy) {
      shimmerAnim.setValue(0);

      loop = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
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

  // LensSelector só aparece quando há mais de 1 lente e nenhum controle ativo
  // (modo manual não conta como "controle ativo" para esse efeito)
  const showLensSelector =
    lenses &&
    lenses.length > 1 &&
    (activeControl === "none" || activeControl === "manual");

  return (
    <View style={styles.shutterContainer}>
      {/* 🆕 Seletor de lentes — acima da linha do shutter, sempre visível quando inativo */}
      {showLensSelector && (
        <LensSelector
          lenses={lenses}
          activeLensId={activeLensId}
          onSelectLens={onSelectLens}
        />
      )}

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
            style={styles.galleryThumb}
            onPress={() => {
              router.push("components/Galery");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Reanimated.View
              style={[deviceOrientationStyle, styles.galleryThumbInner]}
            >
              {lastPhotoUri ? (
                <Image
                  source={{ uri: lastPhotoUri }}
                  style={styles.galleryImage}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="images-outline" size={20} color="white" />
              )}

              {isBusy && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.shimmerOverlay,
                    {
                      transform: [
                        {
                          translateX: shimmerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-40, 40],
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
                    style={styles.shimmerGradient}
                  />
                </Animated.View>
              )}
            </Reanimated.View>
          </TouchableOpacity>
        </View>

        <View
          pointerEvents={
            activeControl === "none" || activeControl === "manual"
              ? "auto"
              : "none"
          }
        >
          <Shutter takePicture={takePicture} isProcessing={isProcessing} />
        </View>

        <View style={styles.rightControls}>
          <TouchableOpacity
            style={styles.flipButton}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Reanimated.View style={deviceOrientationStyle}>
              <Ionicons name="camera-reverse-outline" size={28} color="white" />
            </Reanimated.View>
          </TouchableOpacity>
        </View>
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
            onRelease={onSliderRelease}
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
