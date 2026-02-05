import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import {
  Button,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import LoadingScreen from "./LoadingScreen";

export default function Galery() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [exifData, setExifData] = useState(null);

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

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Permissão para acessar fotos é necessária.</Text>
        <Pressable onPress={requestPermission}>
          <Text style={{ color: "blue", marginTop: 8 }}>Permitir acesso</Text>
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
        contentContainerStyle={{ padding: 2 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flex: 1 / 3, padding: 0.9 }}
            onPress={() => {
              setModalVisible(true);
              setSelectedImage(item.uri);
              exifHandler(item.id, setExifData);
            }}
          >
            <Image source={{ uri: item.uri }} style={styles.image} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
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
            style={{ width: "100%", height: 350 }}
          />

          <Text
            style={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: 20,
              margin: 10,
              textAlign: "left",
              paddingLeft: 15,
              width: "100%",
            }}
          >
            Informações
          </Text>

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
                <View style={{ width: "95%", marginBottom: 20 }}>
                  <MapViewWeb latitude={Number(lat)} longitude={Number(lon)} />
                </View>
              );
            }
            return null;
          })()}

          {/* <Pressable
            style={{
              marginTop: 20,
              alignSelf: "center",
              backgroundColor: "#ffaa00ff",
              padding: 10,
              borderRadius: 5,
            }}
            onPress={() => setModalVisible(false)}
          >
            <Text style={styles.textStyle}>Fechar</Text>
          </Pressable> */}

          <Button
            title="Fechar"
            onPress={() => setModalVisible(false)}
            color="#ffaa00"
          >
            Fechar
          </Button>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 25,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
    textAlign: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 2,
    // margin: 0.9,
  },

  modal: {
    flex: 1,
    backgroundColor: "#000000",
  },
  modalContent: {
    alignItems: "center",
    paddingBottom: 40,
  },
  efixContainer: {
    flexDirection: "row", // organiza os itens horizontalmente
    flexWrap: "wrap", // permite quebra de linha
    justifyContent: "space-between", // espaçamento entre as colunas
    padding: 10,
  },
  exifItemWrapper: {
    width: "45%", // cerca de metade da tela (menos espaço de margem)
    marginBottom: 10,
  },
});
