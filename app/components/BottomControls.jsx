import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import Reanimated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import { getProjectAlbumName } from "../utils/projects";
import ExposureDialFinal from "./ExposureDialFinal";
import LUTSelector from "./LUTSelector";
import LensSelector from "./LensSelector";
import Shutter from "./shutter";
import styles, { BOTTOM_CONTROLS_MARGIN } from "./BottomControls.styles";

export default function BottomControls({
  retroStyle = false,
  controlsAnim,
  displayedControl,
  activeControl,
  takePicture,
  onToggleFacing,
  zoom,
  setZoom,
  onZoomStart,
  exposure,
  setExposure,
  selectedLutId,
  setSelectedLutId,
  selectedGrainId,
  setSelectedGrainId,
  selectedHalationId,
  setSelectedHalationId,
  zoomSV,
  minZoom,
  maxZoom,
  onSliderRelease,
  availableLuts,
  availableGrains,
  availableHalations,
  isProcessing,
  showProcessingFeedback = isProcessing,
  processingQueueLength,
  galleryRefreshKey,
  activeProject = null,
  imageStackingCapturing = false,
  imageStackingFinishing = false,
  imageStackingContinuousCapturing = false,
  lenses = [],
  activeLensId,
  onSelectLens,
}) {
  const router = useRouter();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const deviceOrientationStyle = useDeviceOrientation();
  const [lastPhotoUri, setLastPhotoUri] = useState(null);

  const processingCount = Math.max(
    processingQueueLength,
    showProcessingFeedback ? 1 : 0,
  );
  const handleShutterPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await takePicture();
  };

  const albumName = activeProject
    ? getProjectAlbumName(activeProject)
    : "Komorebi";
  useEffect(() => {
    let active = true;
    const loadLastPhoto = async () => {
      try {
        const albums = await MediaLibrary.getAlbumsAsync();
        if (!active) return;
        const targetAlbum = albums.find(
          (album) => album.title.toLowerCase() === albumName.toLowerCase(),
        );
        if (!targetAlbum) {
          setLastPhotoUri(null);
          return;
        }
        const photos = await MediaLibrary.getAssetsAsync({
          album: targetAlbum,
          mediaType: "photo",
          first: 1,
          sortBy: [["creationTime", false]],
        });
        if (active) setLastPhotoUri(photos.assets[0]?.uri ?? null);
      } catch (error) {
        console.error("Erro ao carregar última foto:", error);
      }
    };
    void loadLastPhoto();
    return () => {
      active = false;
    };
  }, [galleryRefreshKey, albumName]);

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
    <View
      style={[
        styles.shutterContainer,
        { marginBottom: BOTTOM_CONTROLS_MARGIN + bottomInset },
      ]}
    >
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
            </Reanimated.View>
            {processingCount > 0 && (
              <View
                pointerEvents="none"
                style={styles.processingBadge}
                accessibilityLabel={`${processingCount} foto${processingCount === 1 ? "" : "s"} em processamento`}
              >
                <Ionicons name="sync-outline" size={11} color="#111" />
                <Text style={styles.processingBadgeText}>
                  {processingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View
          pointerEvents={
            activeControl === "none" || activeControl === "manual"
              ? "auto"
              : "none"
          }
        >
          <Shutter
            takePicture={handleShutterPress}
            isProcessing={
              (isProcessing && !imageStackingContinuousCapturing) ||
              imageStackingFinishing
            }
            capturing={imageStackingCapturing && !imageStackingFinishing}
          />
        </View>

        <View style={styles.rightControls}>
          <TouchableOpacity
            style={styles.flipButton}
            onPress={onToggleFacing}
            disabled={imageStackingCapturing}
          >
            <Reanimated.View style={deviceOrientationStyle}>
              <Ionicons name="camera-reverse-outline" size={28} color="white" />
            </Reanimated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.lensSlot,
          retroStyle && styles.retroLensSpacing,
          {
            opacity: shutterOpacity,
            transform: [{ translateY: shutterTranslate }],
          },
        ]}
        pointerEvents={
          !imageStackingCapturing &&
          (activeControl === "none" || activeControl === "manual")
            ? "auto"
            : "none"
        }
      >
        {lenses.length > 1 && !imageStackingCapturing && (
          <LensSelector
            lenses={lenses}
            activeLensId={activeLensId}
            onSelectLens={onSelectLens}
          />
        )}
      </Animated.View>

      <Animated.View
        style={[
          styles.toolsContainer,
          {
            transform: [{ translateY: toolsTranslate }],
            opacity: toolsOpacity,
          },
        ]}
        pointerEvents={
          activeControl !== "none" && activeControl !== "manual"
            ? "auto"
            : "none"
        }
      >
        {displayedControl === "zoom" && (
          <ExposureDialFinal
            value={zoom}
            onChange={(v) => setZoom(v)}
            onInteractionStart={onZoomStart}
            onRelease={onSliderRelease}
            zoomSV={zoomSV}
            minZoom={minZoom}
            maxZoom={maxZoom}
          />
        )}

        {displayedControl === "lut" && (
          <View style={styles.lutSelectorWrapper}>
            <LUTSelector
              selectedLutId={selectedLutId}
              onSelectLut={setSelectedLutId}
              selectedGrainId={selectedGrainId}
              onSelectGrain={setSelectedGrainId}
              selectedHalationId={selectedHalationId}
              onSelectHalation={setSelectedHalationId}
              visible={true}
              availableLuts={availableLuts}
              availableGrains={availableGrains}
              availableHalations={availableHalations}
              takePicture={handleShutterPress}
              isProcessing={
                (isProcessing && !imageStackingContinuousCapturing) ||
                imageStackingFinishing
              }
              capturing={imageStackingCapturing && !imageStackingFinishing}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}
