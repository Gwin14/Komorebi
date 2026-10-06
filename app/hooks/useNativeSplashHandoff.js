import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

// Do not expose the default settings layout. Allow the saved layout to commit
// and reach the native view hierarchy before dismissing the launch screen.
export default function useNativeSplashHandoff({ loading, layoutReady }) {
  useEffect(() => {
    if (loading || !layoutReady) return;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void SplashScreen.hideAsync().catch(() => {});
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [loading, layoutReady]);
}
