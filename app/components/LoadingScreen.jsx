import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function LoadingScreen() {
  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#000",
        },
      ]}
    >
      <ActivityIndicator size="large" />
    </View>
  );
}
