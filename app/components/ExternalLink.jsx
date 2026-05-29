import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Alert,
  Linking,
  Pressable,
  Text,
  View
} from "react-native";
import styles from "./ExternalLink.styles";

export default function ExternalLink({
  label,
  description,
  url, // opcional
  disabled, // opcional (força modo visual)
}) {
  const isClickable = !!url && !disabled;

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!isClickable) return;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Erro", "Não foi possível abrir o link.");
      }
    } catch {
      Alert.alert("Erro", "Ocorreu um erro ao abrir o navegador.");
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      pointerEvents={isClickable ? "auto" : "none"}
      style={({ pressed }) => [
        styles.wrapper,
        pressed && isClickable && styles.wrapperPressed,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.label}>{label}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>

        <View style={styles.iconWrapper}>
          <Feather name="external-link" size={18} color="#ffaa00" />
        </View>
      </View>
    </Pressable>
  );
}

