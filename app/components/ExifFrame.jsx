import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export default function ExifFrame() {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: "https://criador-de-exif-frame.onrender.com" }}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
