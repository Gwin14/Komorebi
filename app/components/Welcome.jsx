import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import {
  TOP_BAR_CONTROLS,
  TOP_BAR_MAX_CONTROLS,
  normalizeTopBarControls,
} from "../utils/topBarControls";
import CustomToggle from "./CustoToggle";
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
    id: "viewfinder",
    eyebrow: "SEU VIEWFINDER",
    title: "Veja a cena do seu jeito.",
    description:
      "Escolha as guias que ajudam você a compor e onde prefere acessar os controles.",
  },
  {
    id: "topbar",
    eyebrow: "SUA TOPBAR",
    title: "Deixe por perto só o que importa.",
    description:
      "Selecione até 8 atalhos e organize a ordem em que eles aparecem.",
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

function ViewfinderCustomizer({ draft, onChange }) {
  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.customizerScrollContent}
      style={styles.customizerScroll}
    >
      <View style={styles.viewfinderPreview}>
        <Image source={PHOTO} style={styles.viewfinderPhoto} />
        <View style={styles.viewfinderShade} />
        {draft.gridVisible && (
          <View pointerEvents="none" style={styles.previewGrid}>
            <View style={[styles.previewGridLineV, { left: "33.333%" }]} />
            <View style={[styles.previewGridLineV, { left: "66.666%" }]} />
            <View style={[styles.previewGridLineH, { top: "33.333%" }]} />
            <View style={[styles.previewGridLineH, { top: "66.666%" }]} />
          </View>
        )}
        {draft.levelVisible && (
          <View style={styles.previewLevel}>
            <View style={styles.previewLevelLine} />
            <View style={styles.previewLevelDot} />
          </View>
        )}
        {draft.histogramVisible && (
          <View style={styles.previewHistogram}>
            {[10, 19, 28, 22, 35, 29, 17, 12].map((height, index) => (
              <View
                key={`${height}-${index}`}
                style={[styles.previewHistogramBar, { height }]}
              />
            ))}
          </View>
        )}
        <View
          style={[
            styles.previewControls,
            draft.topBarBelow
              ? styles.previewControlsBottom
              : styles.previewControlsTop,
          ]}
        >
          {["ellipse-outline", "color-filter-outline", "settings-outline"].map(
            (icon) => (
              <Ionicons key={icon} name={icon} size={15} color="#fff" />
            ),
          )}
        </View>
      </View>

      <View style={styles.toggleList}>
        <CustomToggle
          label="Grade de terços"
          value={draft.gridVisible}
          onValueChange={(value) => onChange("gridVisible", value)}
        />
        <CustomToggle
          label="Nível"
          value={draft.levelVisible}
          onValueChange={(value) => onChange("levelVisible", value)}
        />
        <CustomToggle
          label="Histograma"
          value={draft.histogramVisible}
          onValueChange={(value) => onChange("histogramVisible", value)}
        />
        <CustomToggle
          label="Controles abaixo"
          value={draft.topBarBelow}
          onValueChange={(value) => onChange("topBarBelow", value)}
        />
      </View>
    </ScrollView>
  );
}

function TopBarCustomizer({ controls, onChange }) {
  const selected = normalizeTopBarControls(controls);
  const available = TOP_BAR_CONTROLS.filter(
    (control) => !selected.includes(control.id),
  );
  const controlsById = Object.fromEntries(
    TOP_BAR_CONTROLS.map((control) => [control.id, control]),
  );

  const move = (index, offset) => {
    const destination = index + offset;
    if (destination < 0 || destination >= selected.length) return;
    const next = [...selected];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    onChange(next);
  };

  const remove = (controlId) => {
    if (controlId === "settings") return;
    onChange(selected.filter((id) => id !== controlId));
  };

  const add = (controlId) => {
    if (selected.length >= TOP_BAR_MAX_CONTROLS) return;
    onChange(normalizeTopBarControls([...selected, controlId]));
  };

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.topBarScrollContent}
      style={styles.customizerScroll}
    >
      <View style={styles.topBarCountRow}>
        <Text style={styles.topBarSectionLabel}>ORDEM DOS ATALHOS</Text>
        <Text style={styles.topBarCount}>
          {selected.length}/{TOP_BAR_MAX_CONTROLS}
        </Text>
      </View>

      <View style={styles.selectedControlList}>
        {selected.map((controlId, index) => {
          const control = controlsById[controlId];
          return (
            <View key={controlId} style={styles.selectedControlRow}>
              <Ionicons name={control.icon} size={19} color="#ffb21d" />
              <Text numberOfLines={1} style={styles.selectedControlLabel}>
                {control.label}
              </Text>
              <Pressable
                accessibilityLabel={`Mover ${control.label} para cima`}
                disabled={index === 0}
                hitSlop={8}
                onPress={() => move(index, -1)}
                style={index === 0 && styles.controlActionDisabled}
              >
                <Ionicons name="chevron-up" size={20} color="#fff" />
              </Pressable>
              <Pressable
                accessibilityLabel={`Mover ${control.label} para baixo`}
                disabled={index === selected.length - 1}
                hitSlop={8}
                onPress={() => move(index, 1)}
                style={
                  index === selected.length - 1 && styles.controlActionDisabled
                }
              >
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </Pressable>
              <Pressable
                accessibilityLabel={`Remover ${control.label}`}
                disabled={controlId === "settings"}
                hitSlop={8}
                onPress={() => remove(controlId)}
                style={
                  controlId === "settings" && styles.controlActionDisabled
                }
              >
                <Ionicons name="close" size={21} color="#ff7373" />
              </Pressable>
            </View>
          );
        })}
      </View>

      {available.length > 0 && (
        <>
          <Text style={styles.availableLabel}>ADICIONAR CONTROLES</Text>
          <View style={styles.availableControls}>
            {available.map((control) => {
              const disabled = selected.length >= TOP_BAR_MAX_CONTROLS;
              return (
                <Pressable
                  key={control.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Adicionar ${control.label}`}
                  disabled={disabled}
                  onPress={() => add(control.id)}
                  style={({ pressed }) => [
                    styles.availableControl,
                    disabled && styles.availableControlDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name={control.icon} size={18} color="#ffb21d" />
                  <Text style={styles.availableControlText}>{control.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Slide({ item, width, draft, onDraftChange, onControlsChange }) {
  if (item.id === "viewfinder" || item.id === "topbar") {
    return (
      <LinearGradient
        colors={["#1b1208", "#080706", "#000000"]}
        style={[styles.slide, styles.customizerSlide, { width }]}
      >
        <View style={styles.customizerHeading}>
          <Text style={styles.eyebrow}>{item.eyebrow}</Text>
          <Text style={styles.customizerTitle}>{item.title}</Text>
          <Text style={styles.customizerDescription}>{item.description}</Text>
        </View>
        {item.id === "viewfinder" ? (
          <ViewfinderCustomizer draft={draft} onChange={onDraftChange} />
        ) : (
          <TopBarCustomizer
            controls={draft.topBarControls}
            onChange={onControlsChange}
          />
        )}
      </LinearGradient>
    );
  }

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
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const isClosingRef = useRef(false);
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const screenTranslateY = useRef(new Animated.Value(10)).current;
  const [currentIndex, setCurrentIndex] = useState(0);
  const {
    gridVisible,
    setGridVisible,
    levelVisible,
    setLevelVisible,
    histogramVisible,
    setHistogramVisible,
    topBarBelow,
    setTopBarBelow,
    topBarControls,
    setTopBarControls,
    setFirstTime,
  } = useSettings();
  const [draft, setDraft] = useState(() => ({
    gridVisible,
    levelVisible,
    histogramVisible,
    topBarBelow,
    topBarControls: normalizeTopBarControls(topBarControls),
  }));
  const isLastSlide = currentIndex === FLOW.length - 1;
  const safeTop =
    insets.top ||
    initialWindowMetrics?.insets.top ||
    (Platform.OS === "android" ? StatusBar.currentHeight || 24 : 44);
  const safeBottom = insets.bottom || initialWindowMetrics?.insets.bottom || 16;

  useEffect(() => {
    const entranceAnimation = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    entranceAnimation.start();

    return () => entranceAnimation.stop();
  }, [screenOpacity, screenTranslateY]);

  const finish = (shouldApply = false) => {
    if (isClosingRef.current) return;

    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        toValue: 6,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (shouldApply) {
        setGridVisible(draft.gridVisible);
        setLevelVisible(draft.levelVisible);
        setHistogramVisible(draft.histogramVisible);
        setTopBarBelow(draft.topBarBelow);
        setTopBarControls(normalizeTopBarControls(draft.topBarControls));
      }
      setFirstTime(false);
    });
  };

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const goTo = (index) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  };

  const advance = () => {
    if (isLastSlide) {
      finish(true);
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
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => finish(false)}
    >
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.animatedContent,
            {
              opacity: screenOpacity,
              transform: [{ translateY: screenTranslateY }],
            },
          ]}
        >
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
              <Slide
                key={item.id}
                item={item}
                width={width}
                draft={draft}
                onDraftChange={updateDraft}
                onControlsChange={(controls) =>
                  updateDraft("topBarControls", controls)
                }
              />
            ))}
          </ScrollView>

          <View pointerEvents="box-none" style={styles.chrome}>
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0.76)", "transparent"]}
              style={styles.headerShade}
            />

            <View style={[styles.header, { paddingTop: safeTop + 8 }]}>
              <Brand />
              {!isLastSlide && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pular apresentação"
                  hitSlop={12}
                  onPress={() => finish(false)}
                  style={({ pressed }) => [
                    styles.skipButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.skipText}>Pular</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.footer, { paddingBottom: safeBottom + 10 }]}>
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
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
