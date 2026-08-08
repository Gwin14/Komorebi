import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
        <Ionicons name={triggerIcon} size={compact ? 22 : 26} color="#ffaa00" />
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
            data={listItems}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const isActive = item.isNone
                ? activeProjectId == null
                : item.id === activeProjectId;

              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onChangeProject(item.isNone ? null : item.id);
                    setVisible(false);
                  }}
                >
                  <View style={styles.rowLabelContainer}>
                    <Ionicons
                      name={isActive ? "folder" : "folder-outline"}
                      size={18}
                      color={isActive ? "#ffaa00" : "rgba(255,255,255,0.62)"}
                    />
                    <Text
                      style={[
                        styles.rowLabel,
                        isActive && styles.rowLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark" size={16} color="#ffaa00" />
                  )}
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
