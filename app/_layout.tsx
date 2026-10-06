import { Stack } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { useState } from "react";
import useNativeSplashHandoff from "./hooks/useNativeSplashHandoff";
import * as SplashScreen from "expo-splash-screen";

void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

Sentry.init({
  dsn:
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
    "https://cd139b926fdfcff7d0904702b844bc77@o4512165584764928.ingest.us.sentry.io/4512165639487488",
  environment:
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ||
    (__DEV__ ? "development" : "production"),
  tracesSampleRate: __DEV__ ? 1 : 0.2,
});

function AppNavigator({ layoutReady }: { layoutReady: boolean }) {
  const { loading } = useSettings();
  useNativeSplashHandoff({ loading, layoutReady });
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
      }}
    />
  );
}

function RootLayout() {
  const [layoutReady, setLayoutReady] = useState(false);
  return (
    <GestureHandlerRootView
      style={{ flex: 1 }}
      onLayout={() => setLayoutReady(true)}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SettingsProvider>
          <AppNavigator layoutReady={layoutReady} />
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
