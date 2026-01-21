import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Galery() {
  const router = useRouter();

  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

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
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={32} color="white" />
      </TouchableOpacity>

      <Text style={styles.title}>Galeria</Text>
      <FlatList
        data={photos}
        numColumns={3}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 2 }}
        renderItem={({ item }) => (
          <Image source={{ uri: item.uri }} style={styles.image} />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text>Nenhuma foto encontrada no álbum Komorebi.</Text>
          </View>
        }
      />
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
    width: "33.33%",
    aspectRatio: 1,
    borderRadius: 2,
    margin: 0.9,
  },
  backButton: {
    position: "absolute",
    top: 59,
    left: 16,
    zIndex: 10,
  },
});
