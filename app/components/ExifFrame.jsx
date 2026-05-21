import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";
import styles from "./ExifFrame.styles";

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
