import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Button,
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
import { ExifItem } from "../components/ExifItem";
import { MapViewWeb } from "../components/MapViewWeb";
import { exifHandler } from "../utils/exifFormatter";
import { EXIF_SCHEMA } from "../utils/exifSchema";
import BackButton from "./BackButton";
import styles from "./Galery.styles";
import LoadingScreen from "./LoadingScreen";

const PHOTOS_PER_ROW = 4;
const FULL_SCREEN_DISMISS_DISTANCE = 80;
const FULL_SCREEN_DISMISS_VELOCITY = 0.65;
const FULL_SCREEN_FADE_DURATION = 500;

const runAfterNextPaint = (callback) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
};

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
  const today = startOfDay(new Date());
  const daysAgo = Math.round((today - photoDate) / 86400000);

  if (daysAgo === 0) return "Hoje";
  if (daysAgo === 1) return "Ontem";

  if (daysAgo > 1 && daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
    }).format(photoDate);

    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(photoDate);

  return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
};

const groupPhotosByDate = (photos) => {
  const photosByDate = new Map();

  [...photos]
    .sort((a, b) => b.creationTime - a.creationTime)
    .forEach((photo) => {
      const dateKey = getDateKey(photo.creationTime);
      const group = photosByDate.get(dateKey);

      if (group) {
        group.photos.push(photo);
      } else {
        photosByDate.set(dateKey, {
          timestamp: photo.creationTime,
          photos: [photo],
        });
      }
    });

  return Array.from(photosByDate.values()).map((group) => {
    const rows = [];

    for (let index = 0; index < group.photos.length; index += PHOTOS_PER_ROW) {
      rows.push(group.photos.slice(index, index + PHOTOS_PER_ROW));
    }

    return {
      title: getSectionTitle(group.timestamp),
      data: rows,
    };
  });
};

const getKomorebiAlbum = async () => {
  const albums = await MediaLibrary.getAlbumsAsync();
  return albums.find((album) => album.title === "Komorebi") || null;
};

const getContainedImageSize = (photo, maxWidth, maxHeight) => {
  const assetWidth = Number(photo?.width);
  const assetHeight = Number(photo?.height);
  const safeMaxWidth = Math.max(Number(maxWidth) || 1, 1);
  const safeMaxHeight = Math.max(Number(maxHeight) || 1, 1);
  const width =
    Number.isFinite(assetWidth) && assetWidth > 0 ? assetWidth : safeMaxWidth;
  const height =
    Number.isFinite(assetHeight) && assetHeight > 0
      ? assetHeight
      : safeMaxHeight;
  const imageRatio = width / height;
  const viewportRatio = safeMaxWidth / safeMaxHeight;

  if (imageRatio > viewportRatio) {
    return {
      width: safeMaxWidth,
      height: safeMaxWidth / imageRatio,
    };
  }

  return {
    width: safeMaxHeight * imageRatio,
    height: safeMaxHeight,
  };
};

export default function Galery() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailAnimationType, setDetailAnimationType] = useState("slide");
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [fullScreenContentVisible, setFullScreenContentVisible] =
    useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [exifData, setExifData] = useState(null);
  const [exifLoading, setExifLoading] = useState(false);
  const [modalSwitchBackdropVisible, setModalSwitchBackdropVisible] =
    useState(false);
  const detailPagerRef = useRef(null);
  const fullScreenPagerRef = useRef(null);
  const pendingFullScreenRef = useRef(null);
  const shouldReopenDetailsRef = useRef(false);
  const infoDataAnimation = useRef(new Animated.Value(0)).current;
  const fullScreenFadeOpacity = useRef(new Animated.Value(0)).current;
  const fullScreenTranslateY = useRef(new Animated.Value(0)).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();

  const loadKomorebiPhotos = useCallback(async () => {
    try {
      setLoading(true);

      const album = await getKomorebiAlbum();

      if (!album) {
        setPhotos([]);
        setLoading(false);
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
          if (asset.uri.startsWith("ph://")) {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            return {
              ...asset,
              uri: info.localUri || asset.uri,
            };
          }
          return asset;
        }),
      );

      setPhotos(resolvedAssets);
    } catch (e) {
      console.log("Erro ao carregar fotos:", e);
    } finally {
      setLoading(false);
    }
  }, []);

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
  const photoSections = useMemo(
    () => groupPhotosByDate(orderedPhotos),
    [orderedPhotos],
  );
  const selectedIndex = useMemo(
    () => orderedPhotos.findIndex((photo) => photo.id === selectedAssetId),
    [orderedPhotos, selectedAssetId],
  );

  const selectPhotoAtIndex = useCallback(
    (index) => {
      const photo = orderedPhotos[index];
      if (photo && photo.id !== selectedAssetId) {
        setExifData(null);
        setSelectedAssetId(photo.id);
      }
    },
    [orderedPhotos, selectedAssetId],
  );

  const handlePagerScrollEnd = useCallback(
    (event) => {
      const index = Math.round(
        event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
      );
      selectPhotoAtIndex(index);
    },
    [screenWidth, selectPhotoAtIndex],
  );

  const finishFullScreenClose = useCallback(() => {
    shouldReopenDetailsRef.current = true;
    setFullScreenVisible(false);
    setFullScreenContentVisible(false);
    fullScreenFadeOpacity.setValue(0);
    fullScreenTranslateY.setValue(0);
  }, [fullScreenFadeOpacity, fullScreenTranslateY]);

  const closeFullScreen = useCallback(() => {
    if (!fullScreenVisible || !fullScreenContentVisible) return;

    setFullScreenContentVisible(false);
    setModalSwitchBackdropVisible(true);
    fullScreenTranslateY.setValue(0);
    Animated.timing(fullScreenFadeOpacity, {
      toValue: 0,
      duration: FULL_SCREEN_FADE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) finishFullScreenClose();
    });
  }, [
    finishFullScreenClose,
    fullScreenFadeOpacity,
    fullScreenContentVisible,
    fullScreenTranslateY,
    fullScreenVisible,
  ]);

  const openFullScreen = useCallback((photo) => {
    setSelectedAssetId(photo.id);
    pendingFullScreenRef.current = photo;
    setModalSwitchBackdropVisible(true);
    setDetailAnimationType("none");
    runAfterNextPaint(() => setModalVisible(false));
  }, []);

  const handleDetailsDismiss = useCallback(() => {
    const pendingPhoto = pendingFullScreenRef.current;
    pendingFullScreenRef.current = null;

    if (pendingPhoto) {
      fullScreenFadeOpacity.setValue(0);
      fullScreenTranslateY.setValue(0);
      setFullScreenContentVisible(false);
      setFullScreenVisible(true);
    }
  }, [fullScreenFadeOpacity, fullScreenTranslateY]);

  const handleFullScreenDismiss = useCallback(() => {
    if (!shouldReopenDetailsRef.current) return;

    shouldReopenDetailsRef.current = false;
    setDetailAnimationType("none");
    runAfterNextPaint(() => setModalVisible(true));
  }, []);

  const handleDetailsShow = useCallback(() => {
    runAfterNextPaint(() => {
      setModalSwitchBackdropVisible(false);
      setDetailAnimationType("slide");
    });
  }, []);

  const handleFullScreenShow = useCallback(() => {
    Animated.timing(fullScreenFadeOpacity, {
      toValue: 1,
      duration: FULL_SCREEN_FADE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setFullScreenContentVisible(true);
      setModalSwitchBackdropVisible(false);
    });
  }, [fullScreenFadeOpacity]);

  const dismissFullScreen = useCallback(() => {
    fullScreenTranslateY.setValue(0);
    closeFullScreen();
  }, [closeFullScreen, fullScreenTranslateY]);

  const fullScreenPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          const { dx, dy } = gestureState;
          return Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2;
        },
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const { dx, dy } = gestureState;
          return Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2;
        },
        onPanResponderMove: (_, gestureState) => {
          fullScreenTranslateY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          const shouldDismiss =
            Math.abs(gestureState.dy) > FULL_SCREEN_DISMISS_DISTANCE ||
            Math.abs(gestureState.vy) > FULL_SCREEN_DISMISS_VELOCITY;

          if (shouldDismiss) {
            dismissFullScreen();
            return;
          }

          Animated.spring(fullScreenTranslateY, {
            toValue: 0,
            damping: 20,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(fullScreenTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dismissFullScreen, fullScreenTranslateY],
  );

  useEffect(() => {
    if (!modalVisible || !selectedAssetId) return undefined;

    let isCurrentPhoto = true;
    setExifData(null);
    setExifLoading(true);
    exifHandler(selectedAssetId, (data) => {
      if (isCurrentPhoto) {
        setExifData(data);
        setExifLoading(false);
      }
    });

    return () => {
      isCurrentPhoto = false;
    };
  }, [modalVisible, selectedAssetId]);

  useEffect(() => {
    infoDataAnimation.stopAnimation();
    infoDataAnimation.setValue(0);

    if (exifLoading || !exifData) return;

    Animated.timing(infoDataAnimation, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [exifData, exifLoading, infoDataAnimation]);

  useEffect(() => {
    if (!modalVisible || selectedIndex < 0) return;

    const offset = selectedIndex * screenWidth;
    detailPagerRef.current?.scrollToOffset({ offset, animated: false });

    if (fullScreenVisible) {
      fullScreenPagerRef.current?.scrollToOffset({ offset, animated: false });
    }
  }, [fullScreenVisible, modalVisible, screenWidth, selectedIndex]);

  const closeDetails = useCallback(() => {
    setFullScreenVisible(false);
    setModalVisible(false);
  }, []);

  const handleDeletePhoto = async (assetId = selectedAssetId) => {
    if (!assetId) return;

    try {
      await MediaLibrary.deleteAssetsAsync([assetId]);
      closeDetails();
      setSelectedAssetId(null);
      loadKomorebiPhotos();
    } catch (e) {
      console.log("Erro ao excluir foto:", e);
    }
  };

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Permissão para acessar fotos é necessária.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Permitir acesso</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar hidden={fullScreenVisible} />

      <View style={styles.navigationBar}>
        <BackButton top={8} left={0} />
        <Text style={styles.title}>Galeria</Text>
      </View>

      <SectionList
        sections={photoSections}
        keyExtractor={(row) => row.map((photo) => photo.id).join("-")}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.photoRow}>
            {row.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                activeOpacity={0.82}
                style={styles.photoItem}
                onPress={() => {
                  setExifData(null);
                  setSelectedAssetId(photo.id);
                  setModalVisible(true);
                }}
              >
                <Image source={{ uri: photo.uri }} style={styles.image} />
              </TouchableOpacity>
            ))}
            {Array.from({ length: PHOTOS_PER_ROW - row.length }).map(
              (_, index) => (
                <View key={`empty-${index}`} style={styles.photoPlaceholder} />
              ),
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Sua galeria está vazia</Text>
            <Text style={styles.emptyText}>
              As fotos feitas com a Komorebi aparecerão aqui.
            </Text>
          </View>
        }
      />

      {modalSwitchBackdropVisible ? (
        <View
          pointerEvents="none"
          style={[
            styles.modalSwitchBackdrop,
            {
              top: -safeAreaInsets.top,
              bottom: -safeAreaInsets.bottom,
              left: -safeAreaInsets.left,
              right: -safeAreaInsets.right,
            },
          ]}
        />
      ) : null}

      <Modal
        style={styles.modal}
        animationType={detailAnimationType}
        allowSwipeDismissal={true}
        onDismiss={handleDetailsDismiss}
        visible={modalVisible}
        presentationStyle="pageSheet"
        onRequestClose={closeDetails}
        onShow={handleDetailsShow}
      >
        <SafeAreaView style={styles.modal}>
          <FlatList
            ref={detailPagerRef}
            data={orderedPhotos}
            horizontal
            pagingEnabled
            directionalLockEnabled
            disableIntervalMomentum
            nestedScrollEnabled
            scrollEnabled={orderedPhotos.length > 1}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(photo) => photo.id}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            onMomentumScrollEnd={handlePagerScrollEnd}
            renderItem={({ item: photo }) => {
              const pageExifData =
                photo.id === selectedAssetId ? exifData : null;
              const lat = pageExifData?.latitude ?? pageExifData?.GPSLatitude;
              const lon = pageExifData?.longitude ?? pageExifData?.GPSLongitude;

              return (
                <ScrollView
                  style={[styles.modal, { width: screenWidth }]}
                  contentContainerStyle={styles.modalContent}
                  directionalLockEnabled
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Pressable
                    accessibilityHint="Abre a foto em tela cheia"
                    accessibilityLabel="Ampliar foto"
                    accessibilityRole="button"
                    onPress={() => openFullScreen(photo)}
                    style={styles.selectedImagePage}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      resizeMode="cover"
                      style={styles.selectedImage}
                    />
                  </Pressable>

                  <View style={styles.header}>
                    <Text style={styles.infoTitle}>Informações</Text>
                    {pageExifData?.komorebiBadges?.length ? (
                      <Animated.View
                        style={[
                          styles.badgeScroll,
                          styles.badgeContainer,
                          { opacity: infoDataAnimation },
                        ]}
                      >
                        {pageExifData.komorebiBadges.map((badge) => (
                          <View key={badge} style={styles.badge}>
                            <Text style={styles.badgeText}>{badge}</Text>
                          </View>
                        ))}
                      </Animated.View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.exifFrameButton}
                      onPress={() => {
                        closeDetails();
                        router.push({
                          pathname: "components/ExifFrameWithPhoto",
                          params: { photoUri: photo.uri },
                        });
                      }}
                    >
                      <Image
                        source={require("../../assets/images/exif-frame-icon.png")}
                        style={styles.exifFrameIcon}
                      />
                    </TouchableOpacity>
                  </View>

                  {photo.id === selectedAssetId && exifLoading ? (
                    <View style={styles.photoDataLoading}>
                      <ActivityIndicator color="#ffaa00" size="small" />
                    </View>
                  ) : pageExifData ? (
                    <Animated.View
                      style={[
                        styles.photoDataContent,
                        {
                          opacity: infoDataAnimation,
                          transform: [
                            {
                              translateY: infoDataAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [14, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <View style={styles.efixContainer}>
                        {Object.entries(EXIF_SCHEMA).map(([key, config]) => {
                          const value = pageExifData[key];
                          if (!value) return null;
                          if (key === "latitude" || key === "longitude") {
                            return null;
                          }

                          return (
                            <View
                              key={key}
                              style={[
                                styles.exifItemWrapper,
                                key === "date" && styles.exifItemWide,
                              ]}
                            >
                              <ExifItem
                                icon={config.icon}
                                label={config.label}
                                value={String(value)}
                              />
                            </View>
                          );
                        })}
                      </View>

                      {lat != null && lon != null ? (
                        <View pointerEvents="none" style={styles.mapContainer}>
                          <MapViewWeb
                            latitude={Number(lat)}
                            longitude={Number(lon)}
                          />
                        </View>
                      ) : null}
                    </Animated.View>
                  ) : null}

                  <View style={styles.modalActions}>
                    <Button
                      title="Fechar"
                      onPress={closeDetails}
                      color="#ffaa00"
                    />

                    <Button
                      title="Excluir foto"
                      onPress={() => handleDeletePhoto(photo.id)}
                      color="#ff4444"
                    />
                  </View>
                </ScrollView>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="none"
        onDismiss={handleFullScreenDismiss}
        onRequestClose={closeFullScreen}
        onShow={handleFullScreenShow}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={fullScreenVisible}
      >
        <View
          style={styles.fullScreenModal}
          {...fullScreenPanResponder.panHandlers}
        >
          <Animated.View
            pointerEvents={fullScreenContentVisible ? "auto" : "none"}
            style={[
              styles.fullScreenContent,
              {
                opacity: fullScreenFadeOpacity,
                transform: [{ translateY: fullScreenTranslateY }],
              },
            ]}
          >
            <FlatList
              ref={fullScreenPagerRef}
              data={orderedPhotos}
              horizontal
              pagingEnabled
              directionalLockEnabled
              disableIntervalMomentum
              initialScrollIndex={Math.max(selectedIndex, 0)}
              scrollEnabled={orderedPhotos.length > 1}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(photo) => photo.id}
              getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
              onMomentumScrollEnd={handlePagerScrollEnd}
              renderItem={({ item: photo }) => {
                const imageSize = getContainedImageSize(
                  photo,
                  screenWidth,
                  screenHeight,
                );

                return (
                  <Pressable
                    accessibilityHint="Volta para as informações da foto"
                    accessibilityLabel="Fechar tela cheia"
                    accessibilityRole="button"
                    onPress={closeFullScreen}
                    style={[
                      styles.fullScreenPage,
                      { width: screenWidth, height: screenHeight },
                    ]}
                  >
                    <Image
                      pointerEvents="none"
                      source={{ uri: photo.uri }}
                      resizeMode="contain"
                      style={styles.fullScreenImage}
                    />
                    <Pressable
                      onPress={(event) => event.stopPropagation()}
                      style={imageSize}
                    />
                  </Pressable>
                );
              }}
            />
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
