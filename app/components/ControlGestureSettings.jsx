import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { useSettings } from "../context/SettingsContext";
import {
  VERTICAL_GESTURE_OPTIONS,
  HORIZONTAL_GESTURE_OPTIONS,
  VOLUME_ACTION_OPTIONS,
} from "../utils/controlGestures";
import styles from "./Settings.styles";
import controlStyles from "./ControlGestureSettings.styles";

export const CONTROL_GESTURE_FIELDS = [
  { key: "vertical", label: "Para cima e para baixo", icon: "swap-vertical-outline", options: VERTICAL_GESTURE_OPTIONS },
  { key: "horizontal", label: "Para os lados", icon: "swap-horizontal-outline", options: HORIZONTAL_GESTURE_OPTIONS },
  { key: "volumeUp", label: "Aumentar volume", icon: "volume-high-outline", options: VOLUME_ACTION_OPTIONS },
  { key: "volumeDown", label: "Diminuir volume", icon: "volume-low-outline", options: VOLUME_ACTION_OPTIONS },
];

export default function ControlGestureSettings({ fieldKey = null }) {
  const { controlGestures, setControlGestures } = useSettings();
  const router = useRouter();
  const field = CONTROL_GESTURE_FIELDS.find(({ key }) => key === fieldKey);
  if (field) {
    return (
      <View style={styles.section}>
        <View style={styles.group}>
          {field.options.filter(({ iosOnly }) => !iosOnly || Platform.OS === "ios").map((option) => {
            const selected = controlGestures[field.key] === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  setControlGestures((current) => ({ ...current, [field.key]: option.id }));
                  router.back();
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              >
                <View style={styles.menuText}>
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {option.description && <Text style={styles.rowDescription}>{option.description}</Text>}
                </View>
                {selected && <Ionicons name="checkmark" size={20} color="#ffaa00" />}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <>
      <Text style={styles.intro}>
        Escolha atalhos para usar no viewfinder da câmera.
      </Text>
      {["Gestos", "Botões de volume"].map((title, group) => (
        <View key={title} style={styles.section}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDescription}>
            {group === 0
              ? "Para cima abre ou ativa; para baixo fecha ou desativa. Para a direita avança; para a esquerda volta."
              : "Cada clique executa uma ação. Tirar foto usa o timer geral; os atalhos de 3s e 10s valem só para aquela foto."}
          </Text>
          <View style={styles.group}>
            {CONTROL_GESTURE_FIELDS.slice(group * 2, group * 2 + 2).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${item.options.find(({ id }) => id === controlGestures[item.key])?.label}`}
                onPress={() => router.push({
                  pathname: "/components/SettingsSection",
                  params: { section: "gestures", control: item.key },
                })}
                style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
              >
                <View style={styles.menuIcon}><Ionicons name={item.icon} size={21} color="#ffaa00" /></View>
                <View style={styles.menuText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowDescription}>
                    {item.options.find(({ id }) => id === controlGestures[item.key])?.label}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#676767" />
              </Pressable>
            ))}
          </View>
          {group === 1 && Platform.OS === "ios" && (
            <Text style={controlStyles.note}>
              No iPhone, diminuir volume, Camera Control e o botão de Ação compartilham este atalho quando acionam a câmera.
            </Text>
          )}
        </View>
      ))}
    </>
  );
}
