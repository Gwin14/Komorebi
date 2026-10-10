import { Platform } from "react-native";

export function getOnboardingControlPresets(platform = Platform.OS) {
  const ios = platform === "ios";
  return [
    {
      id: "professional",
      title: "Quero controles profissionais",
      icon: "options-outline",
      controls: ["manual", "rawCapture", "vertical", "timer", "flash", "settings"],
    },
    {
      id: "creative",
      title: "Quero controles criativos",
      icon: "color-palette-outline",
      controls: ["luts", "vertical", "doubleCapture", ...(ios ? ["livePhoto"] : []), "timer", "settings"],
    },
    {
      id: "signature",
      title: "Quero o diferencial do app",
      icon: "sparkles-outline",
      controls: ["luts", "doubleCapture", ...(ios ? ["stacking"] : []), "projects", "weather", "settings"],
    },
  ];
}
