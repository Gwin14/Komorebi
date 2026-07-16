import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "@react-native-documents/picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
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
import styles from "./Settings.styles";

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
    saveOriginalWithoutEffects,
    setSaveOriginalWithoutEffects,
    customLuts,
    setCustomLuts,
    topBarControls,
    setTopBarControls,
    topBarBelow,
    setTopBarBelow,
    setFirstTime,
  } = useSettings();

  const controlsMap = {};
  TOP_BAR_CONTROLS.forEach((control) => {
    controlsMap[control.id] = control;
  });

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

      const pickedUri = res.fileCopyUri || res.uri;
      const normalizedUri = pickedUri
        ? decodeURI(pickedUri.replace(/^file:\/\//, ""))
        : null;

      if (!normalizedUri) {
        throw new Error("URI inválida do arquivo selecionado");
      }

      const content = await RNFS.readFile(normalizedUri, "utf8");
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

  const handleRemoveControl = (controlId) => {
    if (controlId === "settings") return;
    setTopBarControls((prev) => prev.filter((id) => id !== controlId));
  };

  const handleAddControl = (controlId) => {
    if (controlId === "settings") return;

    const selected = topBarControls.includes(controlId);
    if (selected) {
      handleRemoveControl(controlId);
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

  const moveControlInOrder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= topBarControls.length ||
      toIndex >= topBarControls.length
    )
      return;

    const newControls = [...topBarControls];
    const [moved] = newControls.splice(fromIndex, 1);
    newControls.splice(toIndex, 0, moved);

    setTopBarControls(newControls);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Carregando configurações...</Text>
      </View>
    );
  }

  const unselectedControls = TOP_BAR_CONTROLS.filter(
    (control) => !topBarControls.includes(control.id),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        <Text style={styles.title}>Página de Configurações</Text>

        <View style={styles.togglesSection}>
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
            label="Controles invertidos"
            value={topBarBelow}
            onValueChange={setTopBarBelow}
          />

          <View style={[styles.divider, { width: "100%" }]} />

          <CustomToggle
            label="Salvar cópia sem efeitos"
            value={saveOriginalWithoutEffects}
            onValueChange={setSaveOriginalWithoutEffects}
          />

          <CustomToggle
            label="Salvar Localização nas Fotos"
            value={location}
            onValueChange={setLocation}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.topBarSection}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Controles da TopBar</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Use as setas para alterar a ordem. Marque até {TOP_BAR_MAX_CONTROLS}{" "}
            controles. Configurações é obrigatório e sempre fica visível.
          </Text>

          {topBarControls.length > 0 && (
            <View>
              <View style={styles.draggableList}>
                {topBarControls.map((controlId, index) => (
                  <View key={controlId} style={styles.draggableRow}>
                    <View style={styles.controlRowLeft}>
                      <Text style={styles.controlName}>
                        {controlsMap[controlId]?.label}
                      </Text>
                    </View>

                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => {
                          if (index > 0) moveControlInOrder(index, index - 1);
                        }}
                        disabled={index === 0}
                        style={[
                          styles.smallButton,
                          index === 0 && styles.smallButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          name="chevron-up-outline"
                          size={18}
                          color={index > 0 ? "#ffaa00" : "#5a5a5a"}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          if (index < topBarControls.length - 1)
                            moveControlInOrder(index, index + 1);
                        }}
                        disabled={index === topBarControls.length - 1}
                        style={[
                          styles.smallButton,
                          index === topBarControls.length - 1 &&
                            styles.smallButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          name="chevron-down-outline"
                          size={18}
                          color={
                            index < topBarControls.length - 1
                              ? "#ffaa00"
                              : "#5a5a5a"
                          }
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          handleRemoveControl(controlId);
                        }}
                        style={styles.removeButton}
                      >
                        <Ionicons
                          name="close-outline"
                          size={18}
                          color="#ff6b6b"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {unselectedControls.length > 0 && (
            <View>
              <View style={styles.availableList}>
                {unselectedControls.map((control) => (
                  <TouchableOpacity
                    key={control.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleAddControl(control.id);
                    }}
                    style={styles.availableItem}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color="#ffaa00"
                      style={styles.availableIcon}
                    />
                    <Text style={styles.controlName}>{control.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.lutSection}>
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

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Rever apresentação inicial"
          accessibilityHint="Fecha as configurações e abre novamente o onboarding"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFirstTime(true);
            router.back();
          }}
          style={styles.linkButtonWrapper}
        >
          <ExternalLink
            label="Rever apresentação"
            description="Veja novamente os recursos principais do Komorebi."
            disabled
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            router.push("components/TermosDeUso");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.linkButtonWrapper}
        >
          <ExternalLink label="Termos de Uso" disabled />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            router.push("components/PoliticaDePrivacidade");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.linkButtonWrapper}
        >
          <ExternalLink label="Política de Privacidade" disabled />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            router.push("components/CommingSoon");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.linkButtonWrapper}
        >
          <ExternalLink label="Em breve..." disabled />
        </TouchableOpacity>

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
          style={styles.linkButtonWrapper}
        >
          <ExternalLink label="Gerador de Exif Frame" disabled />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            router.push("components/Feedback");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.linkButtonWrapper}
        >
          <ExternalLink
            label="Dê seu feedback"
            description="Ajude a melhorar o app!"
            disabled
          />
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

        <TouchableOpacity
          onPress={() => {
            require("react-native")
              .Linking.openURL("https://fotoessencia.fabiosantos.dev.br/")
              .catch((e) => {
                console.error("Erro ao abrir link", e);
              });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.siteButton}
        >
          <Image
            source={require("../../assets/images/fotoessencia.jpeg")}
            style={styles.siteIcon}
          />

          <View>
            <Text style={[styles.text, styles.siteTitle]}>Site oficial</Text>
            <Text style={styles.text}>Conheça minha arte!</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={32} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
