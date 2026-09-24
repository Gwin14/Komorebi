import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ExifItem } from "./ExifItem";
import { MapViewWeb } from "./MapViewWeb";
import { useSettings } from "../context/SettingsContext";
import { exifHandler } from "../utils/exifFormatter";
import { EXIF_SCHEMA } from "../utils/exifSchema";
import { DEFAULT_ALBUM_NAME, getProjectAlbumName } from "../utils/projects";
import BackButton from "./BackButton";
import styles from "./Galery.styles";
import LoadingScreen from "./LoadingScreen";
import ProjectChecklist from "./ProjectChecklist";
import ProjectSwipeList from "./ProjectSwipeList";

const PHOTOS_PER_ROW = 4;
const INFO_SWIPE_DISTANCE = 56;

const startOfDay = (date) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
};

const getDateKey = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getSectionTitle = (timestamp) => {
  const photoDate = startOfDay(timestamp);
  const daysAgo = Math.round((startOfDay(new Date()) - photoDate) / 86400000);
  if (daysAgo === 0) return "Hoje";
  if (daysAgo === 1) return "Ontem";
  if (daysAgo > 1 && daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(photoDate);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(photoDate);
  return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
};

const getViewerDate = (timestamp) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));

const groupPhotosByDate = (photos) => {
  const photosByDate = new Map();
  [...photos]
    .sort((a, b) => b.creationTime - a.creationTime)
    .forEach((photo) => {
      const dateKey = getDateKey(photo.creationTime);
      const group = photosByDate.get(dateKey);
      if (group) group.photos.push(photo);
      else photosByDate.set(dateKey, { timestamp: photo.creationTime, photos: [photo] });
    });

  return Array.from(photosByDate.values()).map((group) => {
    const rows = [];
    for (let index = 0; index < group.photos.length; index += PHOTOS_PER_ROW) {
      rows.push(group.photos.slice(index, index + PHOTOS_PER_ROW));
    }
    return { title: getSectionTitle(group.timestamp), data: rows };
  });
};

const getKomorebiAlbum = async (project = null) => {
  const albums = await MediaLibrary.getAlbumsAsync();
  const albumName = project ? getProjectAlbumName(project) : DEFAULT_ALBUM_NAME;
  return albums.find((album) => album.title === albumName) || null;
};

export default function Galery() {
  const { projects, activeProjectId, setProjects } = useSettings();
  const [viewProjectId, setViewProjectId] = useState(activeProjectId);
  const viewProject = viewProjectId
    ? projects.find((project) => project.id === viewProjectId) || null
    : null;
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [intelligentTagsOpen, setIntelligentTagsOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [exifData, setExifData] = useState(null);
  const [exifLoading, setExifLoading] = useState(false);
  const pagerRef = useRef(null);
  const thumbnailRef = useRef(null);
  const galleryPhotoRefs = useRef(new Map());
  const closingViewerRef = useRef(false);
  const infoAnimation = useRef(new Animated.Value(0)).current;
  const sharedProgress = useRef(new Animated.Value(0)).current;
  const viewerOpacity = useRef(new Animated.Value(0)).current;
  const [transitionSource, setTransitionSource] = useState(null);
  const [transitionUri, setTransitionUri] = useState(null);
  const [transitionRunning, setTransitionRunning] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();

  const loadKomorebiPhotos = useCallback(
    async (project = viewProject) => {
      try {
        setLoading(true);
        const album = await getKomorebiAlbum(project);
        if (!album) {
          setPhotos([]);
          return;
        }
        const assets = await MediaLibrary.getAssetsAsync({
          album,
          mediaType: "photo",
          sortBy: MediaLibrary.SortBy.creationTime,
          first: 100,
        });
        const resolvedAssets = await Promise.all(
          assets.assets.map(async (asset) => {
            if (!asset.uri.startsWith("ph://")) return asset;
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            return { ...asset, uri: info.localUri || asset.uri };
          }),
        );
        setPhotos(resolvedAssets);
      } catch (error) {
        console.log("Erro ao carregar fotos:", error);
      } finally {
        setLoading(false);
      }
    },
    [viewProject],
  );

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
      return;
    }
    loadKomorebiPhotos();
  }, [loadKomorebiPhotos, permission, requestPermission]);

  const orderedPhotos = useMemo(
    () => [...photos].sort((a, b) => b.creationTime - a.creationTime),
    [photos],
  );
  const photoSections = useMemo(() => groupPhotosByDate(orderedPhotos), [orderedPhotos]);
  const selectedIndex = useMemo(
    () => orderedPhotos.findIndex((photo) => photo.id === selectedAssetId),
    [orderedPhotos, selectedAssetId],
  );
  const selectedPhoto = orderedPhotos[selectedIndex] || null;

  const handleChangeViewProject = useCallback(
    (projectId) => {
      setViewProjectId(projectId);
      loadKomorebiPhotos(projects.find((project) => project.id === projectId));
    },
    [loadKomorebiPhotos, projects],
  );

  const handleCreateProject = useCallback(
    (project) => {
      setProjects((previous) => [...previous, project]);
      setViewProjectId(project.id);
      loadKomorebiPhotos(project);
    },
    [loadKomorebiPhotos, setProjects],
  );

  const handleDeleteProject = useCallback(
    async (project) => {
      try {
        const albums = await MediaLibrary.getAlbumsAsync();
        const album = albums.find((item) => item.title === getProjectAlbumName(project));
        if (album) await MediaLibrary.deleteAlbumsAsync(album, false);
        setProjects((previous) => previous.filter((item) => item.id !== project.id));
        if (viewProjectId === project.id) {
          setViewProjectId(null);
          loadKomorebiPhotos(null);
        }
      } catch (error) {
        console.warn("Erro ao excluir projeto:", error);
      }
    },
    [loadKomorebiPhotos, setProjects, viewProjectId],
  );

  const setInfoPanel = useCallback(
    (open) => {
      setInfoOpen(open);
      if (!open) setIntelligentTagsOpen(false);
      Animated.spring(infoAnimation, {
        toValue: open ? 1 : 0,
        damping: 24,
        stiffness: 230,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    },
    [infoAnimation],
  );

  const measureGalleryPhoto = useCallback((assetId, callback) => {
    const node = galleryPhotoRefs.current.get(assetId);
    if (!node?.measureInWindow) {
      callback(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      callback(
        width > 0 && height > 0 ? { x, y, width, height } : null,
      );
    });
  }, []);

  const closeViewer = useCallback(() => {
    if (closingViewerRef.current || !selectedPhoto) return;
    closingViewerRef.current = true;
    setInfoPanel(false);

    measureGalleryPhoto(selectedPhoto.id, (measuredRect) => {
      setTransitionSource((previous) => measuredRect || previous);
      setTransitionUri(selectedPhoto.uri);
      setTransitionRunning(true);
      viewerOpacity.setValue(0);
      sharedProgress.setValue(1);

      requestAnimationFrame(() => {
        Animated.timing(sharedProgress, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          setViewerVisible(false);
          setTransitionRunning(false);
          closingViewerRef.current = false;
        });
      });
    });
  }, [
    measureGalleryPhoto,
    selectedPhoto,
    setInfoPanel,
    sharedProgress,
    viewerOpacity,
  ]);

  const openViewer = useCallback(
    (photo) => {
      const index = orderedPhotos.findIndex((item) => item.id === photo.id);
      measureGalleryPhoto(photo.id, (measuredRect) => {
        setTransitionSource(
          measuredRect || {
            x: screenWidth / 2,
            y: screenHeight / 2,
            width: 1,
            height: 1,
          },
        );
        setTransitionUri(photo.uri);
        setTransitionRunning(true);
        sharedProgress.setValue(0);
        viewerOpacity.setValue(0);
        setExifData(null);
        setSelectedAssetId(photo.id);
        setViewerVisible(true);
        requestAnimationFrame(() => {
          pagerRef.current?.scrollToOffset({
            offset: Math.max(index, 0) * screenWidth,
            animated: false,
          });
        });
      });
    },
    [
      measureGalleryPhoto,
      orderedPhotos,
      screenHeight,
      screenWidth,
      sharedProgress,
      viewerOpacity,
    ],
  );

  const selectPhotoAtIndex = useCallback(
    (index) => {
      const photo = orderedPhotos[index];
      if (!photo || photo.id === selectedAssetId) return;
      setInfoPanel(false);
      setIntelligentTagsOpen(false);
      setExifData(null);
      setSelectedAssetId(photo.id);
      thumbnailRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    },
    [orderedPhotos, selectedAssetId, setInfoPanel],
  );

  const handlePagerScrollEnd = useCallback(
    (event) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1));
      selectPhotoAtIndex(index);
    },
    [screenWidth, selectPhotoAtIndex],
  );

  const selectThumbnail = useCallback(
    (index) => {
      pagerRef.current?.scrollToOffset({ offset: index * screenWidth, animated: true });
      selectPhotoAtIndex(index);
    },
    [screenWidth, selectPhotoAtIndex],
  );

  const handleViewerShow = useCallback(() => {
    if (selectedIndex < 0) return;
    pagerRef.current?.scrollToOffset({
      offset: selectedIndex * screenWidth,
      animated: false,
    });
    thumbnailRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: false,
      viewPosition: 0.5,
    });
    Animated.timing(sharedProgress, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      viewerOpacity.setValue(1);
      setTransitionRunning(false);
    });
  }, [screenWidth, selectedIndex, sharedProgress, viewerOpacity]);

  const viewerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dy) > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -INFO_SWIPE_DISTANCE || gesture.vy < -0.55) setInfoPanel(true);
        },
      }),
    [setInfoPanel],
  );

  useEffect(() => {
    if (!viewerVisible || !selectedAssetId) return undefined;
    let current = true;
    setExifData(null);
    setExifLoading(true);
    exifHandler(selectedAssetId, (data) => {
      if (!current) return;
      setExifData(data);
      setExifLoading(false);
    });
    return () => {
      current = false;
    };
  }, [selectedAssetId, viewerVisible]);

  const handleDeletePhoto = async (assetId = selectedAssetId) => {
    if (!assetId) return;
    try {
      await MediaLibrary.deleteAssetsAsync([assetId]);
      closeViewer();
      setSelectedAssetId(null);
      loadKomorebiPhotos();
    } catch (error) {
      console.log("Erro ao excluir foto:", error);
    }
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Permissão para acessar fotos é necessária.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Permitir acesso</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) return <LoadingScreen />;

  const panelTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenHeight, 0],
  });
  const photoTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.min(screenHeight * 0.2, 180)],
  });
  const photoScale = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.64],
  });
  const chromeTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  });
  const viewerPhotoTarget = {
    x: 12,
    y: safeAreaInsets.top + 72,
    width: screenWidth - 24,
    height: Math.max(
      screenHeight - safeAreaInsets.top - 238,
      screenHeight * 0.45,
    ),
  };
  const transitionImageStyle = transitionSource
    ? {
        borderRadius: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [19, 28],
        }),
        height: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.height, viewerPhotoTarget.height],
        }),
        left: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.x, viewerPhotoTarget.x],
        }),
        top: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.y, viewerPhotoTarget.y],
        }),
        width: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.width, viewerPhotoTarget.width],
        }),
      }
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="light" />

      <BlurView
        intensity={30}
        tint="dark"
        style={[styles.navigationBar, { paddingTop: safeAreaInsets.top, height: 48 + safeAreaInsets.top }]}
      >
        <BackButton top={70} left={5} />
        <Text style={styles.title}>Galeria</Text>
        <View style={styles.navigationProjectSelector}>
          <ProjectSwipeList
            projects={projects}
            activeProjectId={viewProjectId}
            onChangeProject={handleChangeViewProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            includeNoneOption
            noneOptionLabel="Todas as fotos"
          />
        </View>
      </BlurView>

      <SectionList
        sections={photoSections}
        keyExtractor={(row) => row.map((photo) => photo.id).join("-")}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item: row }) => (
          <View style={styles.photoRow}>
            {row.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                ref={(node) => {
                  if (node) galleryPhotoRefs.current.set(photo.id, node);
                  else galleryPhotoRefs.current.delete(photo.id);
                }}
                activeOpacity={0.82}
                style={styles.photoItem}
                onPress={() => openViewer(photo)}
              >
                <Image source={{ uri: photo.uri }} style={styles.image} />
              </TouchableOpacity>
            ))}
            {Array.from({ length: PHOTOS_PER_ROW - row.length }).map((_, index) => (
              <View key={`empty-${index}`} style={styles.photoPlaceholder} />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Sua galeria está vazia</Text>
            <Text style={styles.emptyText}>As fotos feitas com a Komorebi aparecerão aqui.</Text>
          </View>
        }
      />

      <Modal
        animationType="none"
        onRequestClose={infoOpen ? () => setInfoPanel(false) : closeViewer}
        onShow={handleViewerShow}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={viewerVisible}
      >
        <View style={styles.viewer}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.viewerTransitionBackdrop,
              { opacity: sharedProgress },
            ]}
          />
          <Animated.View
            pointerEvents={transitionRunning ? "none" : "auto"}
            style={[styles.viewerContent, { opacity: viewerOpacity }]}
          >
          <View style={[styles.viewerTopBar, { paddingTop: safeAreaInsets.top + 8 }]}>
            <TouchableOpacity
              accessibilityLabel="Fechar foto"
              accessibilityRole="button"
              onPress={infoOpen ? () => setInfoPanel(false) : closeViewer}
              style={styles.viewerRoundButton}
            >
              <Ionicons name="chevron-back" size={25} color="#fff" />
            </TouchableOpacity>
            <View style={styles.viewerHeading}>
              <Text style={styles.viewerDate} numberOfLines={1}>
                {selectedPhoto ? getViewerDate(selectedPhoto.creationTime) : ""}
              </Text>
              <Text style={styles.viewerCounter}>
                {selectedIndex + 1} de {orderedPhotos.length}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Informações da foto"
              accessibilityRole="button"
              onPress={() => setInfoPanel(true)}
              style={styles.viewerRoundButton}
            >
              <Ionicons name="information" size={23} color="#fff" />
            </TouchableOpacity>
          </View>

          <Animated.View
            style={[
              styles.viewerGestureArea,
              {
                paddingTop: safeAreaInsets.top + 60,
                transform: [
                  { translateY: photoTranslateY },
                  { scale: photoScale },
                ],
              },
            ]}
          >
            <FlatList
              ref={pagerRef}
              data={orderedPhotos}
              horizontal
              pagingEnabled
              directionalLockEnabled
              disableIntervalMomentum
              scrollEnabled={orderedPhotos.length > 1}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(photo) => photo.id}
              getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
              onMomentumScrollEnd={handlePagerScrollEnd}
              renderItem={({ item: photo }) => (
                <View style={[styles.viewerPhotoPage, { width: screenWidth }]}>
                  <View
                    style={styles.viewerPhotoFrame}
                    {...viewerPanResponder.panHandlers}
                  >
                    <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.viewerPhoto} />
                  </View>
                </View>
              )}
            />
          </Animated.View>

          <Animated.View
            pointerEvents={infoOpen ? "none" : "auto"}
            style={[
              styles.viewerBottom,
              {
                opacity: infoAnimation.interpolate({
                  inputRange: [0, 0.7],
                  outputRange: [1, 0],
                }),
                paddingBottom: Math.max(safeAreaInsets.bottom, 14),
                transform: [{ translateY: chromeTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setInfoPanel(true)}
              style={styles.infoHandleButton}
            >
              <View style={styles.infoHandle} />
              <View style={styles.infoButtonContent}>
                <Ionicons name="chevron-up" size={17} color="#ffaa00" />
                <Text style={styles.infoButtonText}>Detalhes da foto</Text>
              </View>
            </TouchableOpacity>
            <FlatList
              ref={thumbnailRef}
              data={orderedPhotos}
              horizontal
              initialScrollIndex={Math.max(selectedIndex, 0)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailList}
              keyExtractor={(photo) => `thumbnail-${photo.id}`}
              getItemLayout={(_, index) => ({ length: 58, offset: 58 * index, index })}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  thumbnailRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
                }, 100);
              }}
              renderItem={({ item, index }) => {
                const active = item.id === selectedAssetId;
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => selectThumbnail(index)}
                    style={[styles.thumbnailButton, active && styles.thumbnailButtonActive]}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                );
              }}
            />
          </Animated.View>

          <Animated.View pointerEvents={infoOpen ? "auto" : "none"} style={[styles.infoBackdrop, { opacity: infoAnimation }]}>
            <Pressable accessibilityLabel="Fechar informações" onPress={() => setInfoPanel(false)} style={styles.infoBackdropPressable} />
          </Animated.View>

          <Animated.View
            pointerEvents={infoOpen ? "auto" : "none"}
            style={[
              styles.infoPanel,
              {
                paddingBottom: Math.max(safeAreaInsets.bottom, 18),
                transform: [{ translateY: panelTranslateY }],
              },
            ]}
          >
            <BlurView intensity={72} tint="dark" style={styles.infoPanelBlur}>
              <View style={styles.infoPanelHandle} />
              <View style={styles.infoHeader}>
                <View>
                  <Text style={styles.infoEyebrow}>FOTO {selectedIndex + 1}</Text>
                  <Text style={styles.infoTitle}>Informações</Text>
                </View>
                <TouchableOpacity onPress={() => setInfoPanel(false)} style={styles.infoCloseButton}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.infoScrollContent} showsVerticalScrollIndicator={false}>
                {exifLoading ? (
                  <View style={styles.photoDataLoading}>
                    <ActivityIndicator color="#ffaa00" size="small" />
                    <Text style={styles.loadingText}>Lendo metadados…</Text>
                  </View>
                ) : exifData ? (
                  <>
                    {exifData.komorebiBadges?.length ? (
                      <View style={styles.badgeContainer}>
                        {exifData.komorebiBadges.map((badge) => (
                          <View key={badge} style={styles.badge}>
                            <Text style={styles.badgeText}>{badge}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {exifData.intelligentTags?.length ? (
                      <View style={styles.intelligentTagsSection}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityState={{ expanded: intelligentTagsOpen }}
                          onPress={() => setIntelligentTagsOpen((open) => !open)}
                          style={styles.intelligentTagsHeader}
                        >
                          <View style={styles.intelligentTagsTitleRow}>
                            <Ionicons name="sparkles-outline" size={17} color="#ffaa00" />
                            <Text style={styles.intelligentTagsTitle}>Tags inteligentes</Text>
                            <View style={styles.intelligentTagsCount}>
                              <Text style={styles.intelligentTagsCountText}>
                                {exifData.intelligentTags.length}
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name={intelligentTagsOpen ? "chevron-up" : "chevron-down"}
                            size={18}
                            color="rgba(255,255,255,0.58)"
                          />
                        </TouchableOpacity>
                        {intelligentTagsOpen ? (
                          <View style={styles.intelligentTagsChips}>
                            {exifData.intelligentTags.map((tag) => (
                              <View key={tag} style={styles.intelligentTagChip}>
                                <Text style={styles.intelligentTagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.exifContainer}>
                      {Object.entries(EXIF_SCHEMA).map(([key, config]) => {
                        const value = exifData[key];
                        if (!value || key === "latitude" || key === "longitude") return null;
                        return (
                          <View key={key} style={[styles.exifItemWrapper, key === "date" && styles.exifItemWide]}>
                            <ExifItem icon={config.icon} label={config.label} value={String(value)} />
                          </View>
                        );
                      })}
                    </View>

                    {(exifData.latitude ?? exifData.GPSLatitude) != null &&
                    (exifData.longitude ?? exifData.GPSLongitude) != null ? (
                      <View pointerEvents="none" style={styles.mapContainer}>
                        <MapViewWeb
                          latitude={Number(exifData.latitude ?? exifData.GPSLatitude)}
                          longitude={Number(exifData.longitude ?? exifData.GPSLongitude)}
                        />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.noMetadataText}>Nenhum metadado disponível para esta foto.</Text>
                )}

                <View style={styles.infoActions}>
                  <ProjectChecklist
                    assetId={selectedPhoto?.id}
                    projects={projects}
                    onProjectsChange={loadKomorebiPhotos}
                    onCreateProject={(project) => setProjects((previous) => [...previous, project])}
                    triggerText="Projetos"
                    triggerStyle={styles.infoActionButton}
                    triggerTextStyle={styles.infoActionText}
                  />
                  <TouchableOpacity
                    style={styles.infoActionButton}
                    onPress={() => {
                      const photoUri = selectedPhoto?.uri;
                      closeViewer();
                      router.push({ pathname: "components/ExifFrameWithPhoto", params: { photoUri } });
                    }}
                  >
                    <Text style={styles.infoActionText}>EXIF Frame</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.infoActionDanger} onPress={() => handleDeletePhoto(selectedPhoto?.id)}>
                    <Ionicons name="trash-outline" size={18} color="#ff6868" />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </BlurView>
          </Animated.View>
          </Animated.View>

          {transitionRunning && transitionUri && transitionImageStyle ? (
            <Animated.Image
              pointerEvents="none"
              resizeMode="cover"
              source={{ uri: transitionUri }}
              style={[styles.viewerTransitionImage, transitionImageStyle]}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
