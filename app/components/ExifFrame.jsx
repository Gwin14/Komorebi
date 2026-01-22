import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";

export default function ExifFrame() {
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: "https://criador-de-exif-frame.onrender.com" }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoading(false)}
      />

      {loading && <LoadingScreen />}

      <BackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
