import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, Text, View } from "react-native";
import styles from "./SettingsTutorialCard.styles";

const DOCS_URL = "https://komorebimobile.vercel.app/docs";
const TUTORIALS = [
  {
    title: "Aprenda a fotografar em RAW",
    description: "Escolha o formato e saiba o que fica salvo.",
    path: "/formatos-de-arquivo",
    image: require("../../assets/images/onboarding/light.jpg"),
    iosOnly: true,
  },
  {
    title: "Explore cores e efeitos",
    description: "Dê seu toque às fotos com LUTs, grão e halation.",
    path: "/cores-e-efeitos",
    image: require("../../assets/images/onboarding/gold.jpg"),
  },
  {
    title: "Experimente os controles manuais",
    description: "Entenda luz, movimento e foco antes de fotografar.",
    path: "/controles-manuais",
    image: require("../../assets/images/onboarding/motion.jpg"),
    iosOnly: true,
  },
  {
    title: "Organize suas fotos em projetos",
    description: "Reúna suas capturas em álbuns pela galeria.",
    path: "/galeria-e-projetos",
    image: require("../../assets/images/onboarding/palms.jpg"),
  },
  {
    title: "Conheça o básico da câmera",
    description: "Veja como usar as lentes e os controles principais.",
    path: "/primeiros-passos",
    image: require("../../assets/images/onboarding/ocean.jpg"),
  },
];

export default function SettingsTutorialCard() {
  const [tutorial] = useState(() => {
    const available = TUTORIALS.filter(({ iosOnly }) => !iosOnly || Platform.OS === "ios");
    return available[Math.floor(Math.random() * available.length)];
  });
  const [opening, setOpening] = useState(false);
  const browserOpen = useRef(false);

  const openTutorial = async () => {
    if (browserOpen.current) return;
    browserOpen.current = true;
    setOpening(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await WebBrowser.openBrowserAsync(`${DOCS_URL}${tutorial.path}`, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: "close",
        controlsColor: "#ffaa00",
        toolbarColor: "#111111",
        createTask: false,
        showTitle: true,
      });
    } catch {
      Alert.alert("Não foi possível abrir o guia", "Tente novamente em instantes.");
    } finally {
      browserOpen.current = false;
      setOpening(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tutorial.title}. ${tutorial.description}`}
      accessibilityHint="Abre o guia no navegador do aparelho."
      accessibilityState={{ disabled: opening, busy: opening }}
      disabled={opening}
      onPress={openTutorial}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Image source={tutorial.image} resizeMode="cover" style={styles.image} accessible={false} />
      <View style={styles.content}>
        <Text style={styles.title}>{tutorial.title}</Text>
        <Text style={styles.description}>{tutorial.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#777" style={styles.chevron} />
    </Pressable>
  );
}
