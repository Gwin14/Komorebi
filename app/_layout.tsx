import { Stack } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SettingsProvider } from "./context/SettingsContext";

Sentry.init({
  dsn:
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
    "https://cd139b926fdfcff7d0904702b844bc77@o4512165584764928.ingest.us.sentry.io/4512165639487488",
  environment:
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ||
    (__DEV__ ? "development" : "production"),
  tracesSampleRate: __DEV__ ? 1 : 0.2,
});

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <Stack
            screenOptions={{
              headerShown: false, // ❌ remove o header
            }}
          />
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
