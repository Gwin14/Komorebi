import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";

export default function Feedback() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: "https://fabiosantoss.notion.site/2ed38f6e929680c08118da0fd3cc3b29?pvs=105",
        }}
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
