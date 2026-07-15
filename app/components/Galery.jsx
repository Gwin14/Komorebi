import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Image,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExifItem } from "../components/ExifItem";
import { MapViewWeb } from "../components/MapViewWeb";
import { exifHandler } from "../utils/exifFormatter";
import { EXIF_SCHEMA } from "../utils/exifSchema";
import BackButton from "./BackButton";
import styles from "./Galery.styles";
import LoadingScreen from "./LoadingScreen";

const PHOTOS_PER_ROW = 4;

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

export default function Galery() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [exifData, setExifData] = useState(null);
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

  const photoSections = useMemo(() => groupPhotosByDate(photos), [photos]);

  const handleDeletePhoto = async () => {
    if (!selectedAssetId) return;

    try {
      await MediaLibrary.deleteAssetsAsync([selectedAssetId]);
      setModalVisible(false);
      setSelectedImage(null);
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
    <SafeAreaView style={styles.container}>
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
                  setModalVisible(true);
                  setSelectedImage(photo.uri);
                  setSelectedAssetId(photo.id);
                  exifHandler(photo.id, setExifData);
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

      <Modal
        style={styles.modal}
        animationType="slide"
        allowSwipeDismissal={true}
        visible={modalVisible}
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setModalVisible(false);
        }}
      >
        <ScrollView
          style={styles.modal}
          contentContainerStyle={styles.modalContent}
        >
          <Image source={{ uri: selectedImage }} style={styles.selectedImage} />

          <View style={styles.header}>
            <Text style={styles.infoTitle}>Informações</Text>
            {exifData?.komorebiBadges?.length ? (
              <ScrollView
                horizontal
                contentContainerStyle={styles.badgeContainer}
                showsHorizontalScrollIndicator={false}
                style={styles.badgeScroll}
              >
                {exifData.komorebiBadges.map((badge) => (
                  <View key={badge} style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <TouchableOpacity
              style={styles.exifFrameButton}
              onPress={() => {
                setModalVisible(false);
                router.push({
                  pathname: "components/ExifFrameWithPhoto",
                  params: { photoUri: selectedImage },
                });
              }}
            >
              <Image
                source={require("../../assets/images/exif-frame-icon.png")}
                style={styles.exifFrameIcon}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.efixContainer}>
            {exifData && (
              <>
                {Object.entries(EXIF_SCHEMA).map(([key, config]) => {
                  const value = exifData[key];
                  if (!value) return null;
                  if (key === "latitude" || key === "longitude") return null;

                  return (
                    <View key={key} style={styles.exifItemWrapper}>
                      <ExifItem
                        icon={config.icon}
                        label={config.label}
                        value={String(value)}
                      />
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {(() => {
            const lat = exifData?.latitude ?? exifData?.GPSLatitude;
            const lon = exifData?.longitude ?? exifData?.GPSLongitude;

            if (lat != null && lon != null) {
              return (
                <View style={styles.mapContainer}>
                  <MapViewWeb latitude={Number(lat)} longitude={Number(lon)} />
                </View>
              );
            }
            return null;
          })()}

          <View style={styles.modalActions}>
            <Button
              title="Fechar"
              onPress={() => setModalVisible(false)}
              color="#ffaa00"
            />

            <Button
              title="Excluir foto"
              onPress={handleDeletePhoto}
              color="#ff4444"
            />
          </View>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}
