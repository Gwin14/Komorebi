import Slider from "@react-native-community/slider";
import { Text, TouchableOpacity, View } from "react-native";
import { MIN_FOCUS_FRAMES, MAX_FOCUS_FRAMES } from "../utils/focusBracketing";
import styles from "./FocusBracketingPanel.styles";

export default function FocusBracketingPanel({ focus, disabled }) {
  const { nearLensPosition: near, farLensPosition: far, frameCount } = focus.config;
  const label = (value) => value === null ? "—" : `${Math.round(value * 100)}%`;
  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Use apoio ou tripé e mantenha a cena parada</Text>
      <View style={styles.row}><Text style={styles.text}>Perto</Text><Text style={styles.text}>Longe</Text></View>
      <Slider minimumValue={0} maximumValue={1} step={0.001} value={focus.position}
        onValueChange={focus.adjust} disabled={disabled}
        minimumTrackTintColor="#ffaa00" maximumTrackTintColor="#666" thumbTintColor="#ffaa00"
        accessibilityLabel="Posição de foco" />
      <View style={styles.row}>
        <TouchableOpacity onPress={focus.markNear} disabled={disabled || !focus.canMark}
          style={[styles.button, (disabled || !focus.canMark) && styles.disabled]} accessibilityRole="button">
          <Text style={styles.text}>Marcar próximo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={focus.markFar} disabled={disabled || !focus.canMark}
          style={[styles.button, (disabled || !focus.canMark) && styles.disabled]} accessibilityRole="button">
          <Text style={styles.text}>Marcar distante</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => focus.adjust(near)} disabled={disabled || near === null} accessibilityLabel="Revisar foco próximo">
          <Text style={styles.limit}>Próximo: {label(near)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => focus.adjust(far)} disabled={disabled || far === null} accessibilityLabel="Revisar foco distante">
          <Text style={styles.limit}>Distante: {label(far)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => focus.setFrameCount(frameCount - 1)} disabled={disabled || frameCount <= MIN_FOCUS_FRAMES}
          style={styles.step} accessibilityLabel="Diminuir quantidade de fotos"><Text style={styles.text}>−</Text></TouchableOpacity>
        <Text style={styles.text}>{frameCount} fotos</Text>
        <TouchableOpacity onPress={() => focus.setFrameCount(frameCount + 1)} disabled={disabled || frameCount >= MAX_FOCUS_FRAMES}
          style={styles.step} accessibilityLabel="Aumentar quantidade de fotos"><Text style={styles.text}>+</Text></TouchableOpacity>
      </View>
      <Text style={styles.message} accessibilityLiveRegion="polite">
        {focus.error || (focus.pending ? "Ajustando foco…" : near === null || far === null
          ? "Marque os dois limites antes de disparar" : near >= far
            ? "O limite próximo precisa ser menor que o distante" : "Intervalo pronto para capturar")}
      </Text>
    </View>
  );
}
