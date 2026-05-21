import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Button,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExifItem } from "../components/ExifItem";
import { MapViewWeb } from "../components/MapViewWeb";
import { exifHandler } from "../utils/exifFormatter";
import { EXIF_SCHEMA } from "../utils/exifSchema";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";
import styles from "./Galery.styles";

export default function Galery() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [exifData, setExifData] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!permission) return;

    if (!permission.granted) {
      requestPermission();
      return;
    }

    loadKomorebiPhotos();
  }, [permission]);

  const getKomorebiAlbum = async () => {
    const albums = await MediaLibrary.getAlbumsAsync();
    return albums.find((album) => album.title === "Komorebi") || null;
  };

  const loadKomorebiPhotos = async () => {
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
  };

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
        <Text>Permissão para acessar fotos é necessária.</Text>
        <Pressable onPress={requestPermission}>
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
      <BackButton />

      <Text style={styles.title}>Galeria</Text>

      <FlatList
        data={photos}
        numColumns={3}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.photoItem}
            onPress={() => {
              setModalVisible(true);
              setSelectedImage(item.uri);
              setSelectedAssetId(item.id);
              exifHandler(item.id, setExifData);
            }}
          >
            <Image source={{ uri: item.uri }} style={styles.image} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text>Nenhuma foto encontrada no álbum Komorebi.</Text>
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
          <Image
            source={{ uri: selectedImage }}
            style={styles.selectedImage}
          />

          <View style={styles.header}>
            <Text style={styles.infoTitle}>
              Informações
            </Text>
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
