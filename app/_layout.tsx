import { Stack } from "expo-router";
import { SettingsProvider } from "./context/SettingsContext";

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack
        screenOptions={{
          headerShown: false, // ❌ remove o header
        }}
      />
    </SettingsProvider>
  );
}
