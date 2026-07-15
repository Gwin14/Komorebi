import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Backbutton from "../components/BackButton";
import styles from "./CommingSoon.styles";

export default function ComingSoon() {
  const recentlyAdded = [
    { id: "1", title: "Controles manuais (ISO, obturador, WB e foco)" },
    { id: "2", title: "RAW / ProRAW em dispositivos compatíveis" },
    { id: "3", title: "Live Photo no iOS" },
    { id: "4", title: "Modo retrato com captura nativa" },
    { id: "5", title: "Disparo pelo botão de volume e Camera Control" },
    { id: "6", title: "TopBar configurável e controles invertidos" },
    { id: "7", title: "LUTs Ameixa e Banana" },
    { id: "8", title: "Badges do Komorebi na galeria" },
  ];

  const comingSoon = [
    { id: "9", title: "Timer para fotos" },
    { id: "10", title: "Grid customizável" },
    { id: "11", title: "Configuração do feedback háptil" },
    { id: "12", title: "Escolha de formato de arquivo" },
    { id: "13", title: "Opção para desativar álbum automático" },
    { id: "14", title: "Melhorias no painel de clima" },
    { id: "15", title: "Ajustes finos no fluxo de EXIF Frame" },
  ];

  const whoKnows = [
    { id: "16", title: "HDR" },
    { id: "17", title: "Widget com sugestões baseadas no clima" },
    { id: "18", title: "Receitas de LUT por cena" },
    { id: "19", title: "Sistema de conquistas fotográficas" },
  ];

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
        scrollEnabled={false}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Backbutton />
      <Text style={styles.header}>Em breve...</Text>
      <FlatList
        data={[{ key: "sections" }]}
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
