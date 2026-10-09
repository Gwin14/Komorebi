import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { BETA_ENABLED, FEEDBACK_URL } from "../utils/beta";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Alert,
  Easing,
  Image,
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
import TopBarControlList from "./TopBarControlList";

const FLOW = [
  {
    id: "welcome",
    title: "A luz passa.\nO instante fica.",
    description:
      "Uma câmera feita para transformar instantes simples em imagens com intenção.",
  },
  {
    id: "control",
    title: "Sua câmera.\nSeu olhar.",
    description:
      "Ajuste exposição, lentes e enquadramento sem tirar os olhos da cena.",
  },
  {
    id: "style",
    title: "Cor, textura\ne intenção.",
    description:
      "Explore LUTs, grãos e efeitos para chegar ao clima que você imaginou.",
  },
  {
    id: "viewfinder",
    title: "Veja a cena do seu jeito.",
    description:
      "Escolha as guias que ajudam você a compor e onde prefere acessar os controles.",
  },
  {
    id: "topbar",
    title: "Deixe por perto só o que importa.",
    description:
      "Selecione até 8 atalhos e organize a ordem em que eles aparecem.",
  },
  {
    id: "permissions",
    title: "Prepare sua câmera.",
    description:
      "Escolha quais acessos ativar.",
  },
  ...(BETA_ENABLED ? [{
    id: "beta",
    title: "Melhor com\nseu olhar.",
    description: "Ajude a melhorar esta versão beta.",
  }] : []),
  {
    id: "ready",
    title: "Agora,\né com você.",
    description:
      "Suas escolhas continuam sob seu controle e podem ser alteradas nos Ajustes do dispositivo.",
  },
];

const PHOTO = require("../../assets/images/onboarding/ocean.jpg");
const APP_ICON = require("../../assets/images/app-icons/KomorebiLogo-iOS-Default-1024.png");
const PHOTOS = {
  welcome: require("../../assets/images/onboarding/light.jpg"),
  control: require("../../assets/images/onboarding/bird.jpg"),
  style: require("../../assets/images/onboarding/motion.jpg"),
  ready: require("../../assets/images/onboarding/palms.jpg"),
};

function Brand() {
  return (
    <View style={styles.brand}>
      <Image source={APP_ICON} style={styles.brandIcon} />
      <Text style={styles.brandName}>KOMOREBI</Text>
    </View>
  );
}

function BetaStep({ diagnosticsEnabled, onDiagnosticsChange }) {
  const openFeedback = async () => {
    try {
      await WebBrowser.openBrowserAsync(FEEDBACK_URL);
    } catch {
      Alert.alert("Feedback", "Não foi possível abrir o formulário. Tente novamente em Configurações > Sobre.");
    }
  };
  return (
    <View style={styles.betaContent}>
      <Pressable accessibilityRole="link" onPress={openFeedback}
        style={({ pressed }) => [styles.feedbackCard, pressed && styles.buttonPressed]}>
        <View style={styles.feedbackCopy}>
          <Text style={styles.feedbackTitle}>Enviar feedback</Text>
          <Text style={styles.feedbackDescription}>Ideias, sugestões ou problemas.</Text>
        </View>
        <Ionicons name="arrow-forward" style={styles.feedbackArrow} size={24} color="#ffaa00" />
      </Pressable>
      <CustomToggle label="Compartilhar diagnósticos" grouped last
        style={styles.betaToggle}
        description="Erros e desempenho via Sentry."
        value={diagnosticsEnabled} onValueChange={onDiagnosticsChange} />
      <Text style={styles.betaNote}>Sem fotos ou localização. Altere em Configurações.</Text>
    </View>
  );
}

const PERMISSION_ITEMS = [
  {
    id: "camera",
    icon: "camera-outline",
    title: "Câmera",
    description: "Para fotografar.",
  },
  {
    id: "media",
    icon: "images-outline",
    title: "Fotos",
    description: "Para salvar suas fotos.",
  },
  {
    id: "location",
    icon: "location-outline",
    title: "Localização",
    description: "Local da captura · opcional.",
  },
];

function PermissionsStep({ permissions }) {
  const [requesting, setRequesting] = useState(null);
  const statusById = {
    camera: permissions.cameraPermission,
    media: permissions.mediaPermission?.status,
    location: permissions.locationPermission?.status,
  };
  const requestById = {
    camera: permissions.requestCameraPermission,
    media: permissions.requestMediaPermission,
    location: permissions.requestLocationPermission,
  };

  const handlePermission = async (permissionId) => {
    if (statusById[permissionId] === "granted" || requesting) return;
    setRequesting(permissionId);
    try {
      await requestById[permissionId]();
    } finally {
      setRequesting(null);
    }
  };

  return (
    <ScrollView
      bounces={false}
      overScrollMode="never"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.permissionsScrollContent}
      style={styles.customizerScroll}
    >
      <View style={styles.permissionList}>
        {PERMISSION_ITEMS.map((item) => {
          const status = statusById[item.id];
          const granted = status === "granted";
          const denied = status === "denied" || status === "restricted";
          const isRequesting = requesting === item.id;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={
                granted
                  ? `${item.title}: acesso permitido`
                  : `${denied ? "Abrir Ajustes para" : "Permitir"} ${item.title.toLowerCase()}`
              }
              disabled={granted || Boolean(requesting)}
              onPress={() => handlePermission(item.id)}
              style={({ pressed }) => [
                styles.permissionCard,
                granted && styles.permissionCardGranted,
                pressed && styles.buttonPressed,
              ]}
            >
              <View
                style={[
                  styles.permissionIcon,
                  granted && styles.permissionIconGranted,
                ]}
              >
                <Ionicons
                  name={granted ? "checkmark" : item.icon}
                  size={22}
                  color={granted ? "#171000" : "#ffaa00"}
                />
              </View>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionCardTitle}>{item.title}</Text>
                <Text style={styles.permissionCardDescription}>
                  {item.description}
                </Text>
              </View>
              <Text
                style={[
                  styles.permissionStatus,
                  granted && styles.permissionStatusGranted,
                ]}
              >
                {isRequesting ? "Aguarde…" : granted ? "Ativado" : denied ? "Ajustes" : "Permitir"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.permissionsNote}>
        Você pode mudar os acessos nos Ajustes.
      </Text>
    </ScrollView>
  );
}

function ViewfinderCustomizer({ draft, onChange }) {
  return (
    <ScrollView
      bounces={false}
      overScrollMode="never"
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

function TopBarCustomizer({ controls, onChange, onDragStateChange }) {
  const selected = normalizeTopBarControls(controls);
  const available = TOP_BAR_CONTROLS.filter(
    (control) => !selected.includes(control.id),
  );
  const [draggingControl, setDraggingControl] = useState(false);

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
      bounces={false}
      overScrollMode="never"
      scrollEnabled={!draggingControl}
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

      <Text style={styles.reorderHint}>
        Arraste pela alça à direita para mudar a ordem.
      </Text>
      <TopBarControlList
        controls={selected}
        onChange={onChange}
        onRemove={remove}
        onDragStateChange={(dragging) => {
          setDraggingControl(dragging);
          onDragStateChange(dragging);
        }}
      />

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
                  <Ionicons name={control.icon} size={18} color="#ffaa00" />
                  <Text style={styles.availableControlText}>
                    {control.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Slide({ item, width, height, safeTop, safeBottom, draft, onDraftChange,
  onControlsChange, permissions, diagnosticsEnabled, onDiagnosticsChange }) {
  const [draggingControl, setDraggingControl] = useState(false);
  const editorial = Boolean(PHOTOS[item.id]);
  return (
    <View style={[styles.slide, { width }]}>
      <ScrollView
        bounces={false}
        overScrollMode="never"
        scrollEnabled={!draggingControl}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.pageContent, { minHeight: height, paddingBottom: safeBottom + 150 }]}>
        {editorial && (
          <View style={[styles.hero, { height: Math.max(220, height * 0.54) }]}>
            {item.id === "style" ? (
              <View style={styles.photoTriptych}>
                {[require("../../assets/images/onboarding/gold.jpg"), PHOTOS.style, PHOTO].map((source, index) => (
                  <Image key={index} source={source} style={[styles.triptychPhoto, index === 1 && styles.triptychCenter]} />
                ))}
              </View>
            ) : <Image source={PHOTOS[item.id]} style={styles.heroPhoto} />}
            <LinearGradient colors={["rgba(0,0,0,0.28)", "transparent", "#000"]}
              locations={[0, 0.45, 1]} style={styles.heroShade} />
          </View>
        )}
        <View style={[styles.copyBlock, !editorial && { paddingTop: safeTop + 92 }]}>
          <Text accessibilityRole="header" style={[styles.title, !editorial && styles.customizerTitle]}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
        {item.id === "viewfinder" && <ViewfinderCustomizer draft={draft} onChange={onDraftChange} />}
        {item.id === "topbar" && <TopBarCustomizer controls={draft.topBarControls} onChange={onControlsChange} onDragStateChange={setDraggingControl} />}
        {item.id === "permissions" && <PermissionsStep permissions={permissions} />}
        {item.id === "beta" && <BetaStep diagnosticsEnabled={diagnosticsEnabled} onDiagnosticsChange={onDiagnosticsChange} />}
      </ScrollView>
    </View>
  );
}

export default function Welcome({ permissions, embedded = false, onComplete }) {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const isClosingRef = useRef(false);
  const mountedRef = useRef(true);
  const indexRef = useRef(0);
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
    diagnosticsEnabled,
    setDiagnosticsEnabled,
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
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [width]);

  useEffect(() => {
    if (isClosingRef.current) return;
    const entranceAnimation = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: reduceMotion ? 0 : 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        toValue: 0,
        duration: reduceMotion ? 0 : 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    entranceAnimation.start();

    return () => entranceAnimation.stop();
  }, [reduceMotion, screenOpacity, screenTranslateY]);

  const finish = (shouldApply = false) => {
    if (isClosingRef.current) return;

    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: reduceMotion ? 0 : 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslateY, {
        toValue: 6,
        duration: reduceMotion ? 0 : 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // An interrupted fade must still release the presentation and its touches.
      if (!mountedRef.current) return;
      if (shouldApply) {
        setGridVisible(draft.gridVisible);
        setLevelVisible(draft.levelVisible);
        setHistogramVisible(draft.histogramVisible);
        setTopBarBelow(draft.topBarBelow);
        setTopBarControls(normalizeTopBarControls(draft.topBarControls));
      }
      setFirstTime(false);
      onComplete?.();
    });
  };

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const goTo = (index) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: !reduceMotion });
    indexRef.current = index;
    setCurrentIndex(index);
  };

  const skip = () => {
    const betaIndex = FLOW.findIndex((item) => item.id === "beta");
    if (betaIndex > currentIndex) goTo(betaIndex);
    else finish(true);
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
    indexRef.current = Math.max(0, Math.min(nextIndex, FLOW.length - 1));
    setCurrentIndex(indexRef.current);
  };

  const Presentation = embedded ? View : Modal;
  const presentationProps = embedded
    ? { style: styles.container }
    : {
        animationType: "none",
        presentationStyle: "fullScreen",
        statusBarTranslucent: true,
        onRequestClose: skip,
      };

  return (
    <Presentation {...presentationProps}>
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
                height={height}
                safeTop={safeTop}
                safeBottom={safeBottom}
                diagnosticsEnabled={diagnosticsEnabled}
                onDiagnosticsChange={setDiagnosticsEnabled}
                draft={draft}
                onDraftChange={updateDraft}
                onControlsChange={(controls) =>
                  updateDraft("topBarControls", controls)
                }
                permissions={permissions}
              />
            ))}
          </ScrollView>

          <View pointerEvents="box-none" style={styles.chrome}>
            <LinearGradient
              pointerEvents="none"
              colors={PHOTOS[FLOW[currentIndex].id]
                ? ["rgba(0,0,0,0.76)", "transparent"]
                : ["#000", "#000", "transparent"]}
              locations={PHOTOS[FLOW[currentIndex].id] ? [0, 1] : [0, 0.7, 1]}
              style={styles.headerShade}
            />

            <View style={[styles.header, { paddingTop: safeTop + 8 }]}>
              <Brand />
              {!isLastSlide && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pular para a etapa final"
                  hitSlop={12}
                  onPress={skip}
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

              <View style={styles.progressRow}>
              <View style={styles.pagination}>
                {FLOW.map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Ir para a etapa ${index + 1}`}
                    accessibilityState={{ selected: index === currentIndex }}
                    hitSlop={8}
                    onPress={() => goTo(index)}
                    style={[
                      styles.paginationDot,
                      index === currentIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>

              <Text style={styles.stepCount}>{String(currentIndex + 1).padStart(2, "0")} <Text style={styles.stepCountMuted}>/ {String(FLOW.length).padStart(2, "0")}</Text></Text>
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
    </Presentation>
  );
}
