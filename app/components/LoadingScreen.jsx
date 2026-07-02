import { ActivityIndicator, View } from "react-native";
import styles from "./LoadingScreen.styles";

export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}
