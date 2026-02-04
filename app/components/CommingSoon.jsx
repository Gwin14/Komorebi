import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Backbutton from "../components/BackButton";

export default function ComingSoon() {
  // Itens separados por seção
  const recentlyAdded = [
    { id: "1", title: "Galeria imbutida" },
    { id: "2", title: "Metadados nas fotos" },
    { id: "3", title: "Álbum criado automaticamente" },
    { id: "4", title: " Previsão do tempo" },
    { id: "5", title: " Filtros (alguns para teste)" },
    { id: "6", title: "Vizualização dos dados da foto" },
    { id: "7", title: "Flash" },
    { id: "8", title: "Zoom" },
  ];

  const comingSoon = [
    { id: "9", title: "Feedback háptil configurável" },
    { id: "10", title: "Mais opções de aspect ratio" },
    { id: "11", title: "Importação de fitros" },
    { id: "12", title: "Timer para fotos" },
  ];

  const whoKnows = [
    { id: "13", title: "Granulado em filtros" },
    { id: "14", title: "Widget (IOS)" },
    { id: "15", title: "Gravação de vídeo" },
    { id: "16", title: "Migração para sistema nativo de câmera" },
  ];

  // renderItem agora recebe IconComponent e iconName como parâmetros
  const renderItem =
    (IconComponent, iconName) =>
    ({ item }) => (
      <View style={styles.itemContainer}>
        <IconComponent name={iconName} size={24} color="#ffaa00ff" />
        <Text style={styles.text}>{item.title}</Text>
      </View>
    );

  const renderSection = (title, data, IconComponent, iconName) => (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem(IconComponent, iconName)}
        scrollEnabled={false} // para o FlatList não interferir na rolagem geral
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Backbutton />
      <Text style={styles.header}>Em breve...</Text>
      <FlatList
        data={[{ key: "sections" }]} // apenas para habilitar rolagem geral
        renderItem={() => (
          <>
            {renderSection(
              "Adicionados recentemente",
              recentlyAdded,
              Feather,
              "check-circle",
            )}
            {renderSection(
              "Vindo aí",
              comingSoon,
              MaterialCommunityIcons,
              "progress-helper",
            )}
            {renderSection(
              "Quem sabe?",
              whoKnows,
              MaterialCommunityIcons,
              "help-circle-outline",
            )}
          </>
        )}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: 20 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    color: "#fff",
    fontSize: 28,
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    color: "#ffffff",
    fontSize: 22,
    marginBottom: 15,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  text: {
    color: "#fff",
    fontSize: 18,
    marginLeft: 10,
  },
});
