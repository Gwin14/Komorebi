import { FEEDBACK_URL } from "../utils/beta";
import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "./BackButton";
import LoadingScreen from "./LoadingScreen";
import styles from "./Feedback.styles";

export default function Feedback() {
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: FEEDBACK_URL,
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
