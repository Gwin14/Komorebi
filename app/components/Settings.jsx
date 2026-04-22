import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "@react-native-documents/picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import RNFS from "react-native-fs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import { addCustomLUT, parseCubeFile } from "../utils/lutProcessor";
import CustomToggle from "./CustoToggle";
import ExternalLink from "./ExternalLink";

export default function Settings() {
  const router = useRouter();

  const {
    retroStyle,
    setRetroStyle,
    gridVisible,
    setGridVisible,
    loading,
    shutterSound,
    setShutterSound,
    location,
    setLocation,
    saveOriginalWithLUT,
    setSaveOriginalWithLUT,
    customLuts,
    setCustomLuts,
  } = useSettings();

  const handleUploadLUT = async () => {
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      const res = Array.isArray(results) ? results[0] : results;
      const fileName = res.name || res.uri?.split("/").pop() || "arquivo.cube";

      if (!fileName.toLowerCase().endsWith(".cube")) {
        alert("Por favor, selecione um arquivo .cube");
        return;
      }

      const content = await RNFS.readFile(res.uri, "utf8");
      const cubeData = parseCubeFile(content);
      const id = "custom_" + Date.now();
      const name = fileName.replace(/\.cube$/i, "");
      addCustomLUT(id, name, cubeData);
      setCustomLuts((prev) => [...prev, { id, name, content }]);
      alert("LUT carregado com sucesso!");
    } catch (err) {
      const errorCode = err && typeof err === "object" ? err.code : null;
      if (
        errorCode === DocumentPicker.errorCodes.OPERATION_CANCELED ||
        errorCode === "OPERATION_CANCELED"
      ) {
        return;
      }
      console.error(err);
      alert("Erro ao carregar LUT");
    }
  };

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

        <CustomToggle
          label="Som do Obturador"
          value={shutterSound}
          onValueChange={setShutterSound}
        />

        <CustomToggle
          label="Salvar cópia sem LUT"
          value={saveOriginalWithLUT}
          onValueChange={setSaveOriginalWithLUT}
        />

        <CustomToggle
          label="Salvar Localização nas Fotos"
          value={location}
          onValueChange={setLocation}
        />

        <TouchableOpacity
          onPress={handleUploadLUT}
          style={{ width: "90%", alignItems: "center", marginTop: 20 }}
        >
          <View style={styles.uploadButton}>
            <Ionicons name="cloud-upload-outline" size={24} color="white" />
            <Text style={styles.uploadText}>Upload LUT</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <ExternalLink
        label="Código fonte"
        // description="Leia nossa política de privacidade online"
        url="https://github.com/Gwin14/Komorebi"
      />

      <TouchableOpacity
        onPress={() => {
          router.push("components/ExifFrame");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={{ width: "100%", alignItems: "center" }}
      >
        <ExternalLink label="Gerador de Exif Frame" disabled />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          router.push("components/Feedback");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={{ width: "100%", alignItems: "center" }}
      >
        <ExternalLink
          label="Dê seu feedback"
          description="Ajude a melhorar o app!"
          disabled
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          router.push("components/CommingSoon");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={{ width: "100%", alignItems: "center" }}
      >
        <ExternalLink label="Em breve..." disabled />
      </TouchableOpacity>

      <View style={styles.divider} />

      <View style={styles.socialContainer}>
        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://www.instagram.com/fotoessencia_/")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Image
            source={require("../../assets/images/youtube.png")}
            style={styles.socialIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://github.com/Gwin14")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Image
            source={require("../../assets/images/github.png")}
            style={styles.socialIcon}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={32} color="white" />
      </TouchableOpacity>
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
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#333",
    padding: 10,
    borderRadius: 8,
  },
  uploadText: {
    color: "white",
    fontSize: 16,
    marginLeft: 10,
  },
  backButton: {
    position: "absolute",
    top: 59,
    left: 16,
    zIndex: 10,
  },
});
