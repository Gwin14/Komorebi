import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Popover from "react-native-popover-view";
import {
  createProject,
  getAlbumNamesForAsset,
  getProjectAlbumName,
  toggleAssetInProject,
} from "../utils/projects";
import styles from "./ProjectSelector.styles";

export default function ProjectChecklist({
  assetId,
  projects = [],
  onProjectsChange,
  onCreateProject,
  triggerIcon = "folder-outline",
  triggerText,
  triggerStyle,
  triggerTextStyle,
}) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [memberNames, setMemberNames] = useState([]);

  const loadMembership = useCallback(async () => {
    if (!assetId) {
      setMemberNames([]);
      return;
    }
    const names = await getAlbumNamesForAsset(assetId);
    setMemberNames(names);
  }, [assetId]);

  useEffect(() => {
    if (visible) {
      loadMembership();
      setIsCreating(false);
      setNewName("");
    }
  }, [visible, assetId, loadMembership]);

  const isMember = (project) =>
    memberNames.includes(getProjectAlbumName(project));

  const handleToggle = async (project) => {
    const currentlyMember = isMember(project);
    await toggleAssetInProject(assetId, project, currentlyMember);
    await loadMembership();
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert("Nome obrigatório", "Digite um nome para o projeto.");
      return;
    }

    const exists = projects.some(
      (project) => project.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (exists) {
      Alert.alert("Projeto existente", "Já existe um projeto com esse nome.");
      return;
    }

    const project = createProject(trimmed);
    onCreateProject(project);
    setNewName("");
    setIsCreating(false);

    // Se a foto já existe, adiciona ao novo álbum imediatamente.
    if (assetId) {
      toggleAssetInProject(assetId, project, false);
    }
  };

  const trigger = (
    <TouchableOpacity
      onPress={() => setVisible(true)}
      accessibilityLabel="Selecionar projetos"
      accessibilityRole="button"
      style={triggerText ? triggerStyle : undefined}
    >
      {triggerText ? (
        <Text style={triggerTextStyle}>{triggerText}</Text>
      ) : (
        <View style={[styles.trigger, styles.triggerCompact]}>
          <Ionicons name={triggerIcon} size={22} color="#ffaa00" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Popover
      isVisible={visible}
      onRequestClose={() => {
        setIsCreating(false);
        setNewName("");
        setVisible(false);
        onProjectsChange?.();
      }}
      backgroundStyle={{ backgroundColor: "transparent" }}
      popoverStyle={styles.popover}
      from={trigger}
    >
      <BlurView intensity={30} tint="dark" style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>PROJETOS</Text>
        </View>

        {isCreating ? (
          <View style={styles.createContainer}>
            <TextInput
              style={styles.input}
              placeholder="Nome do projeto"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newName}
              autoFocus
              onChangeText={setNewName}
              onSubmitEditing={handleCreate}
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setIsCreating(false);
                  setNewName("");
                }}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
                <Text style={styles.addText}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Nenhum projeto ainda</Text>
            }
            renderItem={({ item }) => {
              const member = isMember(item);

              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => handleToggle(item)}
                >
                  <View style={styles.rowLabelContainer}>
                    <Ionicons
                      name={member ? "checkbox" : "checkbox-outline"}
                      size={18}
                      color={member ? "#ffaa00" : "rgba(255,255,255,0.62)"}
                    />
                    <Text
                      style={[
                        styles.rowLabel,
                        member && styles.rowLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {!isCreating && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setIsCreating(true)}
            >
              <Ionicons name="add-outline" size={16} color="#ffaa00" />
              <Text style={styles.newButtonText}>Novo projeto</Text>
            </TouchableOpacity>
          </>
        )}
      </BlurView>
    </Popover>
  );
}
