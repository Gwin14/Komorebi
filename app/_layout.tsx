import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SettingsProvider } from "./context/SettingsContext";

export default function RootLayout() {
  return (
    <SettingsProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false, // ❌ remove o header
          }}
        />
      </GestureHandlerRootView>
    </SettingsProvider>
  );
}
