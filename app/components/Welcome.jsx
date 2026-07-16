import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import styles from "./Welcome.styles";

const FLOW = [
  {
    id: "welcome",
    eyebrow: "BEM-VINDO AO KOMOREBI",
    title: "Fotografe o que a luz revela.",
    description:
      "Uma câmera feita para transformar instantes simples em imagens com intenção.",
  },
  {
    id: "control",
    eyebrow: "CONTROLE CRIATIVO",
    title: "O instante é seu. O controle também.",
    description:
      "Ajuste exposição, lentes e enquadramento sem tirar os olhos da cena.",
  },
  {
    id: "style",
    eyebrow: "ASSINATURA VISUAL",
    title: "Dê cor à sua forma de ver.",
    description:
      "Explore LUTs, grãos e efeitos para chegar ao clima que você imaginou.",
  },
  {
    id: "ready",
    eyebrow: "FEITO PARA FOTOGRAFAR",
    title: "Tudo pronto para o próximo instante.",
    description:
      "Ao continuar, pediremos acesso à câmera. Localização e outros recursos continuam sob o seu controle.",
  },
];

const PHOTO = require("../../assets/images/fotoessencia.jpeg");
const APP_ICON = require("../../assets/images/icone.png");
const MOCKUP = require("../../assets/images/mockup.png");

function Brand() {
  return (
    <View style={styles.brand}>
      <Image source={APP_ICON} style={styles.brandIcon} />
      <Text style={styles.brandName}>KOMOREBI</Text>
    </View>
  );
}

function ControlVisual() {
  return (
    <View style={styles.mockupFrame}>
      <Image source={MOCKUP} resizeMode="cover" style={styles.mockupImage} />
      <LinearGradient
        colors={["transparent", "rgba(0, 0, 0, 0.26)"]}
        style={styles.mockupShade}
      />
      <View style={styles.controlBadge}>
        <Ionicons name="options-outline" size={16} color="#ffb21d" />
        <Text style={styles.controlBadgeText}>CONTROLES INTUITIVOS</Text>
      </View>
    </View>
  );
}

function StyleVisual() {
  return (
    <View style={styles.styleStage}>
      <View style={styles.photoCard}>
        <Image source={PHOTO} style={styles.stylePhoto} />
        <LinearGradient
          colors={["transparent", "rgba(0, 0, 0, 0.78)"]}
          style={styles.photoShade}
        />
        <View style={styles.photoMeta}>
          <Text style={styles.photoMetaLabel}>FILME</Text>
          <Text style={styles.photoMetaValue}>Damasco · 35mm</Text>
        </View>
      </View>

      <View style={styles.presetRail}>
        {[
          ["AMEIXA", "#713d56"],
          ["DAMASCO", "#ffad39"],
          ["CINEMA", "#75896d"],
        ].map(([label, color], index) => (
          <View
            key={label}
            style={[styles.presetChip, index === 1 && styles.presetChipActive]}
          >
            <View style={[styles.presetColor, { backgroundColor: color }]} />
            <Text
              style={[
                styles.presetText,
                index === 1 && styles.presetTextActive,
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReadyVisual() {
  return (
    <View style={styles.readyStage}>
      <View style={styles.iconGlowOuter}>
        <View style={styles.iconGlowInner}>
          <Image source={APP_ICON} style={styles.readyIcon} />
        </View>
      </View>

      <View style={styles.featureRow}>
        {[
          ["camera-outline", "Câmera"],
          ["color-filter-outline", "Estilos"],
          ["shield-checkmark-outline", "Privacidade"],
        ].map(([icon, label]) => (
          <View key={label} style={styles.featureItem}>
            <Ionicons name={icon} size={19} color="#ffb21d" />
            <Text style={styles.featureLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Slide({ item, width }) {
  const content = (
    <>
      <View style={styles.visualArea}>
        {item.id === "control" && <ControlVisual />}
        {item.id === "style" && <StyleVisual />}
        {item.id === "ready" && <ReadyVisual />}
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.eyebrow}>{item.eyebrow}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    </>
  );

  if (item.id === "welcome") {
    return (
      <ImageBackground source={PHOTO} style={[styles.slide, { width }]}>
        <LinearGradient
          colors={[
            "rgba(0, 0, 0, 0.06)",
            "rgba(0, 0, 0, 0.12)",
            "rgba(0, 0, 0, 0.94)",
          ]}
          locations={[0, 0.42, 0.82]}
          style={styles.slideBackground}
        >
          {content}
        </LinearGradient>
      </ImageBackground>
    );
  }

  return (
    <LinearGradient
      colors={
        item.id === "control"
          ? ["#1d1309", "#080706", "#000000"]
          : ["#171717", "#070707", "#000000"]
      }
      style={[styles.slide, { width }]}
    >
      {content}
    </LinearGradient>
  );
}

export default function Welcome() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setFirstTime } = useSettings();
  const isLastSlide = currentIndex === FLOW.length - 1;

  const finish = () => setFirstTime(false);

  const goTo = (index) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  };

  const advance = () => {
    if (isLastSlide) {
      finish();
      return;
    }

    goTo(currentIndex + 1);
  };

  const handleScrollEnd = (event) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.max(0, Math.min(nextIndex, FLOW.length - 1)));
  };

  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={finish}
    >
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
        >
          {FLOW.map((item) => (
            <Slide key={item.id} item={item} width={width} />
          ))}
        </ScrollView>

        <SafeAreaView pointerEvents="box-none" style={styles.chrome}>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(0,0,0,0.76)", "transparent"]}
            style={styles.headerShade}
          />

          <View style={styles.header}>
            <Brand />
            {!isLastSlide && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pular apresentação"
                hitSlop={12}
                onPress={finish}
                style={({ pressed }) => [
                  styles.skipButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.skipText}>Pular</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.footer}>
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0,0,0,0.98)"]}
              style={styles.footerShade}
            />

            <View style={styles.pagination}>
              {FLOW.map((item, index) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir para a etapa ${index + 1}`}
                  hitSlop={8}
                  onPress={() => goTo(index)}
                  style={[
                    styles.paginationDot,
                    index === currentIndex && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.actions}>
              {currentIndex > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar"
                  onPress={() => goTo(currentIndex - 1)}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isLastSlide ? "Abrir a câmera" : "Continuar"
                }
                onPress={advance}
                style={({ pressed }) => [
                  styles.primaryButton,
                  currentIndex === 0 && styles.primaryButtonFull,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLastSlide ? "Abrir a câmera" : "Continuar"}
                </Text>
                <Ionicons
                  name={isLastSlide ? "camera-outline" : "arrow-forward"}
                  size={20}
                  color="#111"
                />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
