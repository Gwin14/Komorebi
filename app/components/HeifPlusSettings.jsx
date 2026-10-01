import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { Alert, DeviceEventEmitter, Pressable, Text, View } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { DEFAULT_HEIF_PLUS_SETTINGS, HEIF_PLUS_CONTROLS } from "../utils/heifPlusSettings";
import { discardHeifPlus, listHeifPlusJobs, retryHeifPlus } from "../../modules/camera-raw-capture";
import CustomToggle from "./CustoToggle";
import styles from "./Settings.styles";
import heifStyles from "./HeifPlusSettings.styles";

export default function HeifPlusSettings() {
  const { heifPlusSettings, setHeifPlusSettings, heifPlusSupport } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    let mounted = true;
    const refresh = () => listHeifPlusJobs().then((value) => { if (mounted) setJobs(value); }).catch(console.warn);
    void refresh();
    const subscription = DeviceEventEmitter.addListener("heifPlusJobsChanged", refresh);
    const updates = DeviceEventEmitter.addListener("heifPlusJobsUpdated", refresh);
    return () => { mounted = false; subscription.remove(); updates.remove(); };
  }, []);
  const update = (key, value) => setHeifPlusSettings((current) => ({ ...current, [key]: value }));
  const supported = (key) => heifPlusSupport?.supportedControls?.[key] !== false;
  const manualDefault = (key, min, max) => ({
    sharpnessAmount: 0.3, luminanceNoiseReductionAmount: 0.3, contrastAmount: 0.15,
    localToneMapAmount: 0.5, exposure: 0, boostAmount: 1, boostShadowAmount: 1,
    neutralTemperature: 6500, neutralTint: 0,
  })[key] ?? (min + max) / 2;
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajustes de revelação HEIF+"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.group, styles.actionRow, pressed && styles.rowPressed]}
      >
        <View style={styles.menuText}>
          <Text style={styles.rowLabel}>Revelação HEIF+</Text>
          <Text style={styles.rowDescription}>Ajustes do RAW · preferências salvas</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#777" />
      </Pressable>
      {expanded && <View style={heifStyles.expandedContent}>
      <Text style={styles.sectionDescription}>
        Ajustes aplicados ao RAW antes do HEIF. Automático preserva a calibração Apple de cada foto.
        LUT, halation e grain são aplicados depois da revelação. Somente o HEIF é salvo.
      </Text>
      <Text style={styles.sectionDescription}>
        {heifPlusSupport ? `Última captura: decoder ${heifPlusSupport.decoder} · ${heifPlusSupport.bitDepth}-bit`
          : "O suporte exato dos controles será verificado no primeiro RAW. Controles indisponíveis serão ignorados e identificados."}
      </Text>
      <View style={styles.group}>
        {HEIF_PLUS_CONTROLS.map(([key, label, min, max, step]) => {
          const automatic = heifPlusSettings[key] == null;
          const available = supported(key);
          return (
            <View key={key} style={heifStyles.controlRow}>
              <Text style={styles.rowLabel}>{label}</Text>
              {!available && <Text style={styles.rowDescription}>Indisponível no RAW/decoder da última captura.</Text>}
              <CustomToggle grouped label="Automático da Apple" disabled={!available}
                value={automatic} onValueChange={(enabled) => update(key, enabled ? null : manualDefault(key, min, max))} />
              {!automatic && <>
                <Text style={styles.rowDescription}>{Number(heifPlusSettings[key]).toFixed(step >= 1 ? 0 : 2)}</Text>
                <Slider accessibilityLabel={label} minimumValue={min} maximumValue={max}
                  step={step} value={heifPlusSettings[key]} disabled={!available}
                  minimumTrackTintColor="#ffaa00" thumbTintColor="#ffaa00"
                  onValueChange={(value) => update(key, value)} />
              </>}
              {key === "boostShadowAmount" && <Text style={styles.rowDescription}>Sem efeito quando a curva global está em zero.</Text>}
            </View>
          );
        })}
        <CustomToggle grouped label="Recuperar highlights" disabled={!supported("highlightRecoveryEnabled")}
          description="Requer iOS 26 e suporte do RAW/decoder. A API oferece ligar/desligar."
          value={heifPlusSettings.highlightRecoveryEnabled}
          onValueChange={(value) => update("highlightRecoveryEnabled", value)} />
        <CustomToggle grouped label="Correção de lente automática" disabled={!supported("lensCorrectionEnabled")}
          value={heifPlusSettings.lensCorrectionEnabled == null}
          onValueChange={(value) => update("lensCorrectionEnabled", value ? null : true)} />
        {heifPlusSettings.lensCorrectionEnabled != null && <CustomToggle grouped
          label="Aplicar correção de lente" disabled={!supported("lensCorrectionEnabled")}
          value={heifPlusSettings.lensCorrectionEnabled}
          onValueChange={(value) => update("lensCorrectionEnabled", value)} />}
        <Pressable accessibilityRole="button" style={heifStyles.resetButton} onPress={() => setHeifPlusSettings(DEFAULT_HEIF_PLUS_SETTINGS)}>
          <Text style={styles.rowLabel}>Restaurar padrões</Text>
        </Pressable>
      </View>
      </View>}
      {jobs.length > 0 && <>
        <Text style={styles.sectionTitle}>Capturas pendentes ({jobs.length}/3)</Text>
        {jobs.map((job) => <View style={[styles.group, heifStyles.controlRow]} key={job.id}>
          <Text style={styles.rowDescription}>{new Date(job.createdAt).toLocaleString()} · {job.state}</Text>
          {job.error && <Text style={styles.rowDescription}>{job.error}</Text>}
          {job.state === "failed" && <View style={heifStyles.actions}>
            <Pressable accessibilityRole="button" onPress={async () => {
              try { await retryHeifPlus(job.id); DeviceEventEmitter.emit("heifPlusJobsChanged"); }
              catch (error) { Alert.alert("HEIF+", error.message); }
            }}><Text style={styles.rowLabel}>Tentar novamente</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={async () => {
              try { await discardHeifPlus(job.id); DeviceEventEmitter.emit("heifPlusJobsChanged"); }
              catch (error) { Alert.alert("HEIF+", error.message); }
            }}><Text style={styles.rowLabel}>Descartar</Text></Pressable>
          </View>}
        </View>)}
      </>}
    </View>
  );
}
