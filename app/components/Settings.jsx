import { useRouter } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import { useSettings } from "../context/SettingsContext";
import CustomToggle from "./CustoToggle";

export default function Settings() {
  const router = useRouter();

  const {
    saveOriginal,
    setSaveOriginal,
    gridVisible,
    setGridVisible,
    loading,
  } = useSettings();

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Carregando configurações...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Página de Configurações</Text>

      <Button title="Voltar" onPress={() => router.back()} />

      <View style={{ width: "90%", marginTop: 20 }}>
        <CustomToggle
          label="Salvar Original"
          value={saveOriginal}
          onValueChange={setSaveOriginal}
        />

        <CustomToggle
          label="Grade da Câmera"
          value={gridVisible}
          onValueChange={setGridVisible}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    marginBottom: 10,
  },
});
