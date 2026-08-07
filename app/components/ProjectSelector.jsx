import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Popover from "react-native-popover-view";
import { createProject } from "../utils/projects";
import styles from "./ProjectSelector.styles";

export default function ProjectSelector({
  projects = [],
  activeProjectId = null,
  onChangeProject,
  onCreateProject,
  triggerIcon = "folder-outline",
  compact = false,
  includeNoneOption = false,
  noneOptionLabel = "Nenhum projeto",
}) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const activeProject = projects.find(
    (project) => project.id === activeProjectId,
  );

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
    setVisible(false);
  };

  const trigger = (
    <TouchableOpacity
      onPress={() => setVisible(true)}
      accessibilityLabel="Selecionar projeto"
      accessibilityRole="button"
    >
      <View style={[styles.trigger, compact && styles.triggerCompact]}>
        <Ionicons
          name={triggerIcon}
          size={compact ? 22 : 26}
          color="#ffaa00"
        />
        {!compact && (
          <Text style={styles.triggerLabel} numberOfLines={1}>
            {activeProject?.name || noneOptionLabel}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const listItems = [
    ...(includeNoneOption
      ? [{ id: "none", name: noneOptionLabel, isNone: true }]
      : []),
    ...projects.map((project) => ({ ...project, isNone: false })),
  ];

  return (
    <Popover
      isVisible={visible}
      onRequestClose={() => {
        setIsCreating(false);
        setNewName("");
        setVisible(false);
      }}
      backgroundStyle={{ backgroundColor: "transparent" }}
      popoverStyle={styles.popover}
      from={trigger}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Projetos</Text>

        {isCreating ? (
          <View style={styles.createContainer}>
            <TextInput
              style={styles.input}
              placeholder="Nome do projeto"
              placeholderTextColor="#8c8c8c"
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
            data={listItems}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const isActive = item.isNone
                ? activeProjectId == null
                : item.id === activeProjectId;

              return (
                <TouchableOpacity
                  style={[styles.item, isActive && styles.itemActive]}
                  onPress={() => {
                    onChangeProject(item.isNone ? null : item.id);
                    setVisible(false);
                  }}
                >
                  <Ionicons
                    name={isActive ? "folder" : "folder-outline"}
                    size={20}
                    color={isActive ? "#ffaa00" : "#cfcfcf"}
                  />
                  <Text
                    style={[styles.itemLabel, isActive && styles.itemLabelActive]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={18} color="#ffaa00" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {!isCreating && (
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setIsCreating(true)}
          >
            <Ionicons name="add-outline" size={18} color="#ffaa00" />
            <Text style={styles.newButtonText}>Novo projeto</Text>
          </TouchableOpacity>
        )}
      </View>
    </Popover>
  );
}
