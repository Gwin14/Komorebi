import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "@react-native-documents/picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import RNFS from "react-native-fs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/SettingsContext";
import {
  addCustomLUT,
  parseCubeFile,
  removeCustomLUT,
} from "../utils/lutProcessor";
import {
  TOP_BAR_CONTROLS,
  TOP_BAR_MAX_CONTROLS,
} from "../utils/topBarControls";
import CustomLUTItem from "./CustomLUTItem";
import CustomToggle from "./CustoToggle";
import ExternalLink from "./ExternalLink";
import LUTUploadButton from "./LUTUploadButton";

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
    topBarControls,
    setTopBarControls,
    topBarBelow,
    setTopBarBelow,
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

  const handleDeleteLUT = (id) => {
    removeCustomLUT(id);
    setCustomLuts((prev) => prev.filter((lut) => lut.id !== id));
  };

  const handleToggleControl = (controlId) => {
    if (controlId === "settings") return;

    const selected = topBarControls.includes(controlId);
    if (selected) {
      setTopBarControls((prev) => prev.filter((id) => id !== controlId));
      return;
    }

    if (topBarControls.length >= TOP_BAR_MAX_CONTROLS) {
      alert(
        `Você pode selecionar no máximo ${TOP_BAR_MAX_CONTROLS} controles na TopBar.`,
      );
      return;
    }

    setTopBarControls((prev) => [...prev, controlId]);
  };

  const moveControl = (controlId, direction) => {
    setTopBarControls((prev) => {
      const index = prev.indexOf(controlId);
      if (index === -1) return prev;

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      next.splice(index, 1);
      next.splice(nextIndex, 0, controlId);
      return next;
    });
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
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

          <View style={styles.divider} />

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

          <CustomToggle
            label="Controles invertidos"
            value={topBarBelow}
            onValueChange={setTopBarBelow}
          />
        </View>

        <View style={styles.divider} />

        <View style={{ width: "90%" }}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Controles da TopBar</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Marque até {TOP_BAR_MAX_CONTROLS} controles para aparecer na TopBar.
            Configurações é obrigatório e sempre fica visível.
          </Text>
          <View style={styles.controlList}>
            {TOP_BAR_CONTROLS.map((control) => {
              const selected = topBarControls.includes(control.id);
              const selectedIndex = topBarControls.indexOf(control.id);

              return (
                <View key={control.id} style={styles.controlRow}>
                  <View style={styles.controlRowLeft}>
                    <Ionicons
                      name="reorder-three-outline"
                      size={22}
                      color="#fff"
                      style={styles.handleIcon}
                    />
                    <Text style={styles.controlName}>{control.label}</Text>
                  </View>

                  <View style={styles.controlRowRight}>
                    <View style={styles.orderButtons}>
                      <TouchableOpacity
                        onPress={() => moveControl(control.id, "up")}
                        disabled={!selected || selectedIndex <= 0}
                        style={[
                          styles.orderButton,
                          (!selected || selectedIndex <= 0) &&
                            styles.orderButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          name="chevron-up-outline"
                          size={20}
                          color={
                            selected && selectedIndex > 0 ? "#fff" : "#7a7a7a"
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveControl(control.id, "down")}
                        disabled={
                          !selected ||
                          selectedIndex === -1 ||
                          selectedIndex === topBarControls.length - 1
                        }
                        style={[
                          styles.orderButton,
                          (!selected ||
                            selectedIndex === -1 ||
                            selectedIndex === topBarControls.length - 1) &&
                            styles.orderButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          name="chevron-down-outline"
                          size={20}
                          color={
                            selected &&
                            selectedIndex !== -1 &&
                            selectedIndex !== topBarControls.length - 1
                              ? "#fff"
                              : "#7a7a7a"
                          }
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleToggleControl(control.id)}
                      disabled={control.id === "settings"}
                      style={[
                        styles.checkbox,
                        selected && styles.checkboxSelected,
                        control.id === "settings" && styles.checkboxDisabled,
                      ]}
                    >
                      {selected && (
                        <Ionicons name="checkmark" size={16} color="#000" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={{ width: "90%" }}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>LUTs carregados</Text>
            <LUTUploadButton onPress={handleUploadLUT} />
          </View>
          {customLuts.length > 0 && (
            <View style={styles.customLutList}>
              {customLuts.map((lut) => (
                <CustomLUTItem
                  key={lut.id}
                  name={lut.name}
                  onDelete={() => handleDeleteLUT(lut.id)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <ExternalLink
          label="Código fonte"
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
      </ScrollView>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={32} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
    marginTop: 20,
  },
  divider: {
    height: 1,
    width: "90%",
    backgroundColor: "#55555563",
    marginVertical: 12,
  },
  socialIcon: {
    width: 40,
    height: 40,
    aspectRatio: 1,
    resizeMode: "contain",
    marginbottom: 100,
  },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "90%",
    marginTop: 20,
  },
  customLutList: {
    // marginTop: 20,
    width: "100%",

    paddingTop: 12,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // marginBottom: 10,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  sectionSubtitle: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 10,
    lineHeight: 18,
  },
  controlList: {
    width: "100%",
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  controlRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  handleIcon: {
    marginRight: 10,
  },
  controlName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  controlRowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  orderButtons: {
    flexDirection: "row",
    marginRight: 12,
  },
  orderButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  orderButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#777",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  checkboxSelected: {
    backgroundColor: "#ffaa00",
    borderColor: "#ffaa00",
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
  backButton: {
    position: "absolute",
    top: 59,
    left: 16,
    zIndex: 10,
  },
});
