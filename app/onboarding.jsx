import { Stack, useRouter } from "expo-router";
import Welcome from "./components/Welcome";
import { useSettings } from "./context/SettingsContext";
import useCameraBootstrap from "./hooks/useCameraBootstrap";

// Replay belongs to the active navigation screen, not the camera behind Settings.
export default function Onboarding() {
  const router = useRouter();
  const { customLuts } = useSettings();
  const permissions = useCameraBootstrap({ customLuts, loadLuts: false });

  return (
    <>
      <Stack.Screen options={{ statusBarHidden: true, gestureEnabled: false }} />
      <Welcome
        embedded
        permissions={permissions}
        onComplete={() => router.dismissTo("/")}
      />
    </>
  );
}
