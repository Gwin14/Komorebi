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
