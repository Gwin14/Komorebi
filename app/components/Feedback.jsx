import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";

export default function Feedback() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: "https://fabiosantoss.notion.site/2ed38f6e929680c08118da0fd3cc3b29?pvs=105",
        }}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
      />

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={32} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 59,
    left: 16,
    zIndex: 10,
  },
});
