import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";

export default function ExifFrameWithPhoto() {
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef(null);
  const { photoUri } = useLocalSearchParams();

  const injectPhoto = async () => {
    if (!photoUri) return;

    try {
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Injeta via postMessage assim que o site carregar
      webViewRef.current?.injectJavaScript(`
        window.postMessage({
          type: 'LOAD_PHOTO',
          base64: '${base64}'
        }, '*');
        true; // obrigatório no RN
      `);
    } catch (e) {
      console.error("Erro ao injetar foto:", e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: "https://criador-de-exif-frame.onrender.com" }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => {
          setLoading(false);
          injectPhoto(); // injeta após o site terminar de carregar
        }}
      />
      {loading && <LoadingScreen />}
      <BackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
