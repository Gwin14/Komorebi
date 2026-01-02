import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function ExternalLink({ label, url, description }) {
  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!url) return;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Erro", "Não foi possível abrir o link.");
      }
    } catch (error) {
      Alert.alert("Erro", "Ocorreu um erro ao abrir o navegador.");
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.wrapper,
        pressed && styles.wrapperPressed,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.label}>{label}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>

        {/* O ícone substitui o espaço que o Toggle ocupava à direita */}
        <View style={styles.iconWrapper}>
          <Feather name="external-link" size={18} color="#ffaa00" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // Mesmos valores exatos do seu CustomToggle
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginVertical: 4,
    // Garantindo que ele ocupe a largura total disponível
    alignSelf: "stretch",
    width: "90%",
    margin: "auto",
  },
  wrapperPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textContainer: {
    flex: 1,
    paddingRight: 10,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  description: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },
  iconWrapper: {
    // Largura similar à do trilho do toggle (52px) para manter o alinhamento visual
    width: 52,
    alignItems: "flex-end",
    justifyContent: "center",
    // Efeito de brilho para combinar com o thumbActive
    shadowColor: "#ffaa00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
});
