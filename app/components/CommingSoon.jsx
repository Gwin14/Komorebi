import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Backbutton from "../components/BackButton";
import styles from "./CommingSoon.styles";

export default function ComingSoon() {
  // Itens separados por seção
  const recentlyAdded = [
    { id: "1", title: "Importação de LUTs personalizados" },
    { id: "2", title: "Metadados nas fotos" },
    { id: "3", title: "Previsão do tempo" },
    { id: "4", title: "Zoom com gesto de pinça" },
    { id: "5", title: "Compensação de exposição" },
    { id: "6", title: "Aspect ratio customizável" },
    { id: "7", title: "Detecção de sorriso" },
    { id: "8", title: "Migração para câmera nativa" },
    { id: "9", title: "Salvar original junto da foto com LUT" },
    { id: "10", title: "Galeria melhorada" },
    { id: "22", title: "Controles manuais (ISO, obturador, WB, foco)" },
  ];

  const comingSoon = [
    { id: "11", title: "Configuração do feedback háptil" },
    { id: "12", title: "Timer para fotos" },
    { id: "13", title: "Grid customizável" },
    { id: "14", title: "Indicador de zoom" },
    { id: "15", title: "Formato de arquivo" },
    { id: "16", title: "Desativar álbum automático" },
    { id: "17", title: "HDR" },
  ];

  const whoKnows = [
    { id: "18", title: "Widget com sugestões baseadas no clima" },
    { id: "20", title: "RAW" },
    { id: "21", title: "Sistema de conquistas" },
  ];

  // renderItem agora recebe IconComponent e iconName como parâmetros
  const renderItem = (IconComponent, iconName) => {
    function SectionItem({ item }) {
      return (
        <View style={styles.itemContainer}>
          <IconComponent name={iconName} size={24} color="#ffaa00ff" />
          <Text style={styles.text}>{item.title}</Text>
        </View>
      );
    }

    return SectionItem;
  };

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
