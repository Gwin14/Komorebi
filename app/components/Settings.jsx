import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "@react-native-documents/picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import RNFS from "react-native-fs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import useCompositionModel from "../hooks/useCompositionModel";
import { addCustomLUT, parseCubeFile, removeCustomLUT } from "../utils/lutProcessor";
import { TOP_BAR_CONTROLS, TOP_BAR_MAX_CONTROLS } from "../utils/topBarControls";
import CustomLUTItem from "./CustomLUTItem";
import CustomToggle from "./CustoToggle";
import styles from "./Settings.styles";

const ACCENT = "#ffaa00";
export const SETTINGS_PAGES = {
  ROOT: "root",
  CAMERA: "camera",
  PREVIEWS: "previews",
  CAPTURE: "capture",
  INTELLIGENCE: "intelligence",
  CONTROLS: "controls",
  LUTS: "luts",
  ABOUT: "about",
};

function SettingsHeader({ onBack, title }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Voltar" accessibilityRole="button" onPress={onBack} style={styles.headerButton}>
        <Ionicons name="chevron-back" size={25} color="#fff" />
      </TouchableOpacity>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerButton} />
    </View>
  );
}

function Section({ children, description, title }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      {description && <Text style={styles.sectionDescription}>{description}</Text>}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function MenuRow({ description, icon, label, onPress, status }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}>
      <View style={styles.menuIcon}><Ionicons name={icon} size={21} color={ACCENT} /></View>
      <View style={styles.menuText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowDescription}>{description}</Text>}
      </View>
      {status && <Text style={styles.rowStatus}>{status}</Text>}
      <Ionicons name="chevron-forward" size={18} color="#676767" />
    </Pressable>
  );
}

function ActionRow({ description, external = false, icon, label, onPress }) {
  return (
    <Pressable accessibilityRole={external ? "link" : "button"} onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}>
      {icon && <Ionicons name={icon} size={20} color={ACCENT} style={styles.actionIcon} />}
      <View style={styles.menuText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowDescription}>{description}</Text>}
      </View>
      <Ionicons name={external ? "open-outline" : "chevron-forward"} size={18} color="#676767" />
    </Pressable>
  );
}

export default function Settings({ initialPage = SETTINGS_PAGES.ROOT }) {
  const router = useRouter();
  const compositionModel = useCompositionModel();
  const page = Object.values(SETTINGS_PAGES).includes(initialPage)
    ? initialPage
    : SETTINGS_PAGES.ROOT;
  const {
    retroStyle, setRetroStyle, gridVisible, setGridVisible, levelVisible, setLevelVisible,
    histogramVisible, setHistogramVisible, compositionScanEnabled, setCompositionScanEnabled,
    previewLut, setPreviewLut, previewHalation, setPreviewHalation,
    previewGrain, setPreviewGrain, previewDoubleExposure, setPreviewDoubleExposure,
    previewStacking, setPreviewStacking,
    zebraHighlightsEnabled, setZebraHighlightsEnabled, zebraShadowsEnabled,
    setZebraShadowsEnabled,
    intelligentTagsEnabled, setIntelligentTagsEnabled, intelligentFilenameEnabled,
    setIntelligentFilenameEnabled, loading, shutterSound, setShutterSound, location,
    setLocation, saveAsJpeg, setSaveAsJpeg, preserveApplePhotographicStyles,
    setPreserveApplePhotographicStyles, saveOriginalWithoutEffects,
    setSaveOriginalWithoutEffects, customLuts, setCustomLuts, topBarControls,
    setTopBarControls, topBarBelow, setTopBarBelow, setFirstTime,
  } = useSettings();

  const controlsMap = useMemo(
    () => Object.fromEntries(TOP_BAR_CONTROLS.map((control) => [control.id, control])),
    [],
  );

  const openPage = (nextPage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/components/SettingsSection",
      params: { section: nextPage },
    });
  };
  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleUploadLUT = async () => {
    try {
      const results = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles] });
      const res = Array.isArray(results) ? results[0] : results;
      const fileName = res.name || res.uri?.split("/").pop() || "arquivo.cube";
      if (!fileName.toLowerCase().endsWith(".cube")) {
        Alert.alert("Arquivo incompatível", "Selecione um arquivo no formato .cube.");
        return;
      }
      const pickedUri = res.fileCopyUri || res.uri;
      const normalizedUri = pickedUri ? decodeURI(pickedUri.replace(/^file:\/\//, "")) : null;
      if (!normalizedUri) throw new Error("URI inválida do arquivo selecionado");
      const content = await RNFS.readFile(normalizedUri, "utf8");
      const cubeData = parseCubeFile(content);
      const id = `custom_${Date.now()}`;
      const name = fileName.replace(/\.cube$/i, "");
      addCustomLUT(id, name, cubeData);
      setCustomLuts((previous) => [...previous, { id, name, content }]);
      Alert.alert("LUT importado", `${name} já está disponível no seletor.`);
    } catch (error) {
      const errorCode = error && typeof error === "object" ? error.code : null;
      if (errorCode === DocumentPicker.errorCodes.OPERATION_CANCELED || errorCode === "OPERATION_CANCELED") return;
      console.error(error);
      Alert.alert("Não foi possível importar", "Verifique o arquivo e tente novamente.");
    }
  };

  const handleRemoveControl = (controlId) => {
    if (controlId !== "settings") setTopBarControls((previous) => previous.filter((id) => id !== controlId));
  };
  const handleAddControl = (controlId) => {
    if (topBarControls.length >= TOP_BAR_MAX_CONTROLS) {
      Alert.alert("Limite atingido", `A barra comporta até ${TOP_BAR_MAX_CONTROLS} controles.`);
      return;
    }
    setTopBarControls((previous) => [...previous, controlId]);
  };
  const moveControlInOrder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= topBarControls.length || toIndex >= topBarControls.length) return;
    const nextControls = [...topBarControls];
    const [moved] = nextControls.splice(fromIndex, 1);
    nextControls.splice(toIndex, 0, moved);
    setTopBarControls(nextControls);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const modelStatus = compositionModel.status;
  const modelReady = modelStatus.state === "ready";
  const modelProgress = Math.round((modelStatus.progress ?? 0) * 100);
  const modelStateLabel = {
    ready: "Instalado e pronto", downloading: `Baixando ${modelProgress}%`,
    "not-downloaded": "Não instalado · cerca de 1,6 GB",
    unsupported: "Memória insuficiente neste aparelho",
    "runtime-missing": "Indisponível nesta versão do app",
    error: "Falha no download ou carregamento",
  }[modelStatus.state];

  const pageTitles = {
    [SETTINGS_PAGES.ROOT]: "Configurações", [SETTINGS_PAGES.CAMERA]: "Câmera",
    [SETTINGS_PAGES.PREVIEWS]: "Previews",
    [SETTINGS_PAGES.CAPTURE]: "Captura e arquivos", [SETTINGS_PAGES.INTELLIGENCE]: "Recursos inteligentes",
    [SETTINGS_PAGES.CONTROLS]: "Barra de controles", [SETTINGS_PAGES.LUTS]: "LUTs personalizados",
    [SETTINGS_PAGES.ABOUT]: "Sobre e suporte",
  };
  const unselectedControls = TOP_BAR_CONTROLS.filter((control) => !topBarControls.includes(control.id));
  const openExternal = async (url) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await Linking.openURL(url); } catch { Alert.alert("Não foi possível abrir o link"); }
  };

  const renderRoot = () => (
    <>
      <Text style={styles.intro}>Ajuste a experiência da câmera e o modo como suas fotos são salvas.</Text>
      <Section title="Fotografia">
        <MenuRow description="Viewfinder, guias e som do obturador" icon="camera-outline" label="Câmera" onPress={() => openPage(SETTINGS_PAGES.CAMERA)} />
        <MenuRow description="Visualização opcional dos efeitos durante a captura" icon="eye-outline" label="Previews" onPress={() => openPage(SETTINGS_PAGES.PREVIEWS)} />
        <MenuRow description="Formato, cópias e metadados" icon="images-outline" label="Captura e arquivos" onPress={() => openPage(SETTINGS_PAGES.CAPTURE)} />
        {Platform.OS === "ios" && <MenuRow description="Composição, nomes e tags no aparelho" icon="sparkles-outline" label="Recursos inteligentes" onPress={() => openPage(SETTINGS_PAGES.INTELLIGENCE)} status={modelReady ? "Ativo" : "Opcional"} />}
      </Section>
      <Section title="Personalização">
        <MenuRow description="Escolha e ordene os atalhos da câmera" icon="options-outline" label="Barra de controles" onPress={() => openPage(SETTINGS_PAGES.CONTROLS)} status={`${topBarControls.length}/${TOP_BAR_MAX_CONTROLS}`} />
        <MenuRow description="Importe e gerencie arquivos .cube" icon="color-filter-outline" label="LUTs personalizados" onPress={() => openPage(SETTINGS_PAGES.LUTS)} status={`${customLuts.length}`} />
      </Section>
      <Section title="Komorebi">
        <MenuRow description="Ajuda, documentos e links do projeto" icon="information-circle-outline" label="Sobre e suporte" onPress={() => openPage(SETTINGS_PAGES.ABOUT)} />
      </Section>
    </>
  );

  const renderCamera = () => (
    <Section description="Elementos visuais e comportamento durante o enquadramento." title="Viewfinder">
      <CustomToggle grouped label="Estilo retrô" value={retroStyle} onValueChange={setRetroStyle} />
      <CustomToggle grouped label="Grade" value={gridVisible} onValueChange={setGridVisible} />
      <CustomToggle grouped label="Nível" value={levelVisible} onValueChange={setLevelVisible} />
      <CustomToggle grouped label="Histograma em tempo real" value={histogramVisible} onValueChange={setHistogramVisible} />
      {Platform.OS === "ios" && <CustomToggle grouped description="Listras vermelhas nas áreas com luminância acima de 98%." label="Zebras — brancos perdidos" value={zebraHighlightsEnabled} onValueChange={setZebraHighlightsEnabled} />}
      {Platform.OS === "ios" && <CustomToggle grouped description="Listras azuis nas áreas com luminância abaixo de 2%." label="Zebras — sombras perdidas" value={zebraShadowsEnabled} onValueChange={setZebraShadowsEnabled} />}
      <CustomToggle grouped label="Som do obturador" value={shutterSound} onValueChange={setShutterSound} />
      <CustomToggle grouped last label="Controles na parte inferior" value={topBarBelow} onValueChange={setTopBarBelow} />
    </Section>
  );

  const renderPreviews = () => (
    <>
      <Text style={styles.intro}>Os efeitos são aplicados aos frames da câmera em tempo real. A foto salva continua usando o processamento de alta resolução.</Text>
      <Section title="Efeitos">
        <CustomToggle grouped label="LUT" description="Aplica as cores do LUT selecionado à imagem ao vivo." value={previewLut} onValueChange={setPreviewLut} />
        <CustomToggle grouped label="Halation" description="Espalha o brilho das altas luzes da cena." value={previewHalation} onValueChange={setPreviewHalation} />
        <CustomToggle grouped last label="Grain" description="Aplica grão fino à imagem ao vivo." value={previewGrain} onValueChange={setPreviewGrain} />
      </Section>
      {Platform.OS === "ios" && (
        <Section title="Captura em camadas">
          <CustomToggle grouped label="Dupla exposição" description="Mostra a primeira foto sobre a imagem ao vivo." value={previewDoubleExposure} onValueChange={setPreviewDoubleExposure} />
          <CustomToggle grouped last label="Stacking" description="Mostra o resultado acumulado durante Bulb e Motion Blur." value={previewStacking} onValueChange={setPreviewStacking} />
        </Section>
      )}
    </>
  );

  const renderCapture = () => (
    <>
      <Section description="Defina quais versões da imagem serão mantidas." title="Arquivos">
        <CustomToggle grouped last={Platform.OS !== "ios"} label="Salvar cópia sem efeitos" description="Mantém uma versão sem LUT, grain ou halation." value={saveOriginalWithoutEffects} onValueChange={setSaveOriginalWithoutEffects} />
        {Platform.OS === "ios" && <CustomToggle grouped last label="Salvar em JPEG" description="Use para maior compatibilidade. O padrão do iPhone é HEIF." value={saveAsJpeg} onValueChange={(enabled) => { setSaveAsJpeg(enabled); if (enabled) setPreserveApplePhotographicStyles(false); }} />}
      </Section>
      <Section title="Metadados e edição">
        <CustomToggle grouped last={Platform.OS !== "ios"} label="Salvar localização" description="Inclui a posição da captura nos metadados da foto." value={location} onValueChange={setLocation} />
        {Platform.OS === "ios" && <CustomToggle badge="experimental" grouped last description="Cria um HEIF editável no Fotos. Pausa em Live Photo, Retrato e RAW." label="Edição no Fotos da Apple" value={preserveApplePhotographicStyles} onValueChange={(enabled) => { setPreserveApplePhotographicStyles(enabled); if (enabled) setSaveAsJpeg(false); }} />}
      </Section>
    </>
  );

  const renderIntelligence = () => (
    <>
      <Section description="A análise acontece no aparelho. Nada é enviado para a nuvem." title="Análise de imagem">
        <CustomToggle badge="beta" grouped description="Sugere um enquadramento antes da captura." disabled={!modelReady} label="Scanner de composição" value={compositionScanEnabled} onValueChange={setCompositionScanEnabled} />
        <CustomToggle grouped description="Adiciona tags em português aos detalhes da foto." disabled={!modelReady} label="Tags inteligentes" value={intelligentTagsEnabled} onValueChange={setIntelligentTagsEnabled} />
        <CustomToggle grouped last description="Cria um nome descritivo para o arquivo final." disabled={!modelReady} label="Nomes inteligentes" value={intelligentFilenameEnabled} onValueChange={setIntelligentFilenameEnabled} />
      </Section>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Modelo local</Text>
        <View style={styles.modelCard}>
          <View style={styles.modelHeader}>
            <View style={styles.menuText}><Text style={styles.rowLabel}>{modelStatus.modelName}</Text><Text style={styles.rowDescription}>Necessário para os três recursos acima.</Text></View>
            {modelStatus.state === "downloading" && <ActivityIndicator color={ACCENT} />}
          </View>
          <Text style={styles.modelStatus}>{modelStateLabel}</Text>
          {modelStatus.state === "downloading" && <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${modelProgress}%` }]} /></View>}
          {modelStatus.error && <Text style={styles.modelError}>{modelStatus.error}</Text>}
          <View style={styles.modelActions}>
            {(modelStatus.state === "not-downloaded" || modelStatus.state === "error") && <TouchableOpacity disabled={compositionModel.pending} onPress={() => void compositionModel.download().catch((error) => Alert.alert("Recursos inteligentes", error?.message ?? "Não foi possível iniciar o download."))} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Baixar modelo</Text></TouchableOpacity>}
            {modelStatus.state === "downloading" && <TouchableOpacity onPress={compositionModel.cancelDownload} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></TouchableOpacity>}
            {modelStatus.state === "ready" && <TouchableOpacity onPress={() => Alert.alert("Remover modelo local?", "Os recursos inteligentes ficarão pausados. Suas preferências serão mantidas.", [{ text: "Cancelar", style: "cancel" }, { text: "Remover", style: "destructive", onPress: () => void compositionModel.remove().catch((error) => Alert.alert("Recursos inteligentes", error?.message ?? "Não foi possível remover o modelo.")) }])} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Remover modelo</Text></TouchableOpacity>}
          </View>
        </View>
      </View>
    </>
  );

  const renderControls = () => (
    <>
      <Text style={styles.intro}>A barra aceita até {TOP_BAR_MAX_CONTROLS} itens. Configurações permanece sempre disponível.</Text>
      <Section title="Na barra">
        {topBarControls.map((controlId, index) => (
          <View key={controlId} style={styles.controlRow}>
            <View style={styles.controlIndex}><Text style={styles.controlIndexText}>{index + 1}</Text></View>
            <Text numberOfLines={1} style={styles.controlName}>{controlsMap[controlId]?.label}</Text>
            <TouchableOpacity accessibilityLabel={`Mover ${controlsMap[controlId]?.label} para cima`} disabled={index === 0} onPress={() => moveControlInOrder(index, index - 1)} style={styles.iconButton}><Ionicons name="chevron-up" size={18} color={index === 0 ? "#444" : ACCENT} /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Mover ${controlsMap[controlId]?.label} para baixo`} disabled={index === topBarControls.length - 1} onPress={() => moveControlInOrder(index, index + 1)} style={styles.iconButton}><Ionicons name="chevron-down" size={18} color={index === topBarControls.length - 1 ? "#444" : ACCENT} /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Remover ${controlsMap[controlId]?.label}`} disabled={controlId === "settings"} onPress={() => handleRemoveControl(controlId)} style={styles.iconButton}><Ionicons name="close" size={19} color={controlId === "settings" ? "#444" : "#ff7474"} /></TouchableOpacity>
          </View>
        ))}
      </Section>
      {unselectedControls.length > 0 && <Section title="Disponíveis">
        {unselectedControls.map((control) => <Pressable key={control.id} onPress={() => handleAddControl(control.id)} style={({ pressed }) => [styles.availableRow, pressed && styles.rowPressed]}><Ionicons name={control.icon} size={20} color="#b9b9b9" /><Text style={styles.availableName}>{control.label}</Text><Ionicons name="add-circle-outline" size={22} color={ACCENT} /></Pressable>)}
      </Section>}
    </>
  );

  const renderLuts = () => (
    <>
      <Text style={styles.intro}>Importe LUTs no formato .cube para usá-los junto aos efeitos nativos.</Text>
      <TouchableOpacity onPress={handleUploadLUT} style={styles.importButton}><Ionicons name="cloud-upload-outline" size={21} color="#171000" /><Text style={styles.importButtonText}>Importar LUT</Text></TouchableOpacity>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{customLuts.length ? `Importados (${customLuts.length})` : "Importados"}</Text>
        {customLuts.length ? <View style={styles.lutList}>{customLuts.map((lut) => <CustomLUTItem key={lut.id} name={lut.name} onDelete={() => { removeCustomLUT(lut.id); setCustomLuts((previous) => previous.filter((item) => item.id !== lut.id)); }} />)}</View> : <View style={styles.emptyState}><Ionicons name="color-filter-outline" size={28} color="#666" /><Text style={styles.emptyTitle}>Nenhum LUT importado</Text><Text style={styles.emptyDescription}>Seus arquivos personalizados aparecerão aqui.</Text></View>}
      </View>
    </>
  );

  const renderAbout = () => (
    <>
      <Section title="Ajuda">
        <ActionRow description="Conheça novamente os recursos principais." icon="play-circle-outline" label="Rever apresentação" onPress={() => { setFirstTime(true); router.back(); }} />
        <ActionRow icon="mail-outline" label="Enviar feedback" onPress={() => router.push("components/Feedback")} />
        <ActionRow icon="scan-outline" label="Gerador de Exif Frame" onPress={() => router.push("components/ExifFrame")} />
      </Section>
      <Section title="Documentos">
        <ActionRow icon="document-text-outline" label="Termos de uso" onPress={() => router.push("components/TermosDeUso")} />
        <ActionRow icon="shield-checkmark-outline" label="Política de privacidade" onPress={() => router.push("components/PoliticaDePrivacidade")} />
        <ActionRow icon="time-outline" label="Próximos recursos" onPress={() => router.push("components/CommingSoon")} />
      </Section>
      <Section title="Projeto">
        <ActionRow external icon="logo-github" label="Código-fonte" onPress={() => openExternal("https://github.com/Gwin14/Komorebi")} />
        <ActionRow external icon="globe-outline" label="Foto Essência" onPress={() => openExternal("https://fotoessencia.fabiosantos.dev.br/")} />
      </Section>
      <View style={styles.socialRow}>
        {[["logo-instagram", "https://www.instagram.com/fotoessencia_/", "Instagram"], ["at-outline", "https://www.threads.com/@fotoessencia_", "Threads"], ["logo-youtube", "https://www.youtube.com/@FotoEssência", "YouTube"], ["logo-github", "https://github.com/Gwin14", "GitHub"]].map(([icon, url, label]) => <TouchableOpacity accessibilityLabel={label} key={label} onPress={() => openExternal(url)} style={styles.socialButton}><Ionicons name={icon} size={22} color="#d5d5d5" /></TouchableOpacity>)}
      </View>
      <Text style={styles.version}>Komorebi · versão 1.0.0</Text>
    </>
  );

  const renderPage = (pageToRender) => {
    switch (pageToRender) {
      case SETTINGS_PAGES.CAMERA: return renderCamera();
      case SETTINGS_PAGES.PREVIEWS: return renderPreviews();
      case SETTINGS_PAGES.CAPTURE: return renderCapture();
      case SETTINGS_PAGES.INTELLIGENCE: return renderIntelligence();
      case SETTINGS_PAGES.CONTROLS: return renderControls();
      case SETTINGS_PAGES.LUTS: return renderLuts();
      case SETTINGS_PAGES.ABOUT: return renderAbout();
      default: return renderRoot();
    }
  };

  if (loading) return <SafeAreaView style={styles.loadingContainer}><ActivityIndicator color={ACCENT} /><Text style={styles.loadingText}>Carregando configurações…</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <SettingsHeader onBack={goBack} title={pageTitles[page]} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {renderPage(page)}
      </ScrollView>
    </SafeAreaView>
  );
}
