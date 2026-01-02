import { useRouter } from "expo-router";
import {
  Button,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import CustomToggle from "./CustoToggle";

export default function Settings() {
  const router = useRouter();

  const { retroStyle, setRetroStyle, gridVisible, setGridVisible, loading } =
    useSettings();

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Carregando configurações...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Página de Configurações</Text>

      <View style={{ width: "90%", marginTop: 20 }}>
        <CustomToggle
          label="Estilo Retrô do Viewfinder"
          value={retroStyle}
          onValueChange={setRetroStyle}
        />

        <CustomToggle
          label="Grade da Câmera"
          value={gridVisible}
          onValueChange={setGridVisible}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.socialContainer}>
        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://www.instagram.com/fotoessencia_/")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
          }}
        >
          <Image
            source={require("../../assets/images/instagram.png")}
            style={styles.socialIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://www.threads.com/@fotoessencia_")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
          }}
        >
          <Image
            source={require("../../assets/images/threads.png")}
            style={styles.socialIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://www.youtube.com/@FotoEssência")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
          }}
        >
          <Image
            source={require("../../assets/images/youtube.png")}
            style={styles.socialIcon}
          />
        </TouchableOpacity>
      </View>

      <Button title="Voltar" onPress={() => router.back()} color="#ffaa00" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  container: {
    backgroundColor: "#000",
    flex: 1,
    alignItems: "center",
  },
  divider: {
    height: 1,
    width: "90%",
    backgroundColor: "#55555563",
    marginVertical: 12,
  },
  socialIcon: { width: 40, height: 40, aspectRatio: 1, resizeMode: "contain" },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "90%",
    marginTop: 20,
  },
});
