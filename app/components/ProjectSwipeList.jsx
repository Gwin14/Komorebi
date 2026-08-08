import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Popover from "react-native-popover-view";
import { createProject } from "../utils/projects";
import styles from "./ProjectSelector.styles";

const SWIPE_THRESHOLD = -80;

const SwipeRow = ({
  project,
  isActive,
  onSelect,
  onDelete,
}) => {
  const [dragX] = useState(new Animated.Value(0));
  const [open, setOpen] = useState(false);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      if (gesture.dx < 0) {
        dragX.setValue(Math.max(gesture.dx, SWIPE_THRESHOLD - 20));
      } else {
        dragX.setValue(0);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      // Abre o botão de apagar só depois de arrastar além da metade.
      if (gesture.dx < SWIPE_THRESHOLD / 2) {
        setOpen(true);
        Animated.spring(dragX, {
          toValue: SWIPE_THRESHOLD,
          useNativeDriver: false,
        }).start();
      } else {
        setOpen(false);
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
      }
    },
  });

  const closeRow = () => {
    setOpen(false);
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.swipeRowContainer}>
      {open && (
        <TouchableOpacity
          style={styles.swipeDeleteButton}
          onPress={() => {
            closeRow();
            onDelete(project);
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeRow,
          { transform: [{ translateX: dragX }] },
        ]}
      >
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            closeRow();
            onSelect(project.id);
          }}
        >
          <View style={styles.rowLabelContainer}>
            <Ionicons
              name={isActive ? "folder" : "folder-outline"}
              size={18}
              color={isActive ? "#ffaa00" : "rgba(255,255,255,0.62)"}
            />
            <Text
              style={[styles.rowLabel, isActive && styles.rowLabelActive]}
              numberOfLines={1}
            >
              {project.name}
            </Text>
          </View>
          {isActive && (
            <Ionicons name="checkmark" size={16} color="#ffaa00" />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export default function ProjectSwipeList({
  projects = [],
  activeProjectId = null,
  onChangeProject,
  onCreateProject,
  onDeleteProject,
  includeNoneOption = false,
  noneOptionLabel = "Todas as fotos",
  triggerIcon = "folder",
}) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert("Nome obrigatório", "Digite um nome para o projeto.");
      return;
    }

    const exists = projects.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
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
      <View style={styles.trigger}>
        <Ionicons
          name={triggerIcon}
          size={26}
          color="#ffaa00"
        />
      </View>
    </TouchableOpacity>
  );

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
            data={[
              ...(includeNoneOption
                ? [{ id: "none", name: noneOptionLabel, isNone: true }]
                : []),
              ...projects,
            ]}
            keyExtractor={(item) => item.id}
            style={[styles.list, { maxHeight: 260 }]}
            renderItem={({ item }) => {
              if (item.isNone) {
                const isActive = activeProjectId == null;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => onChangeProject(null)}
                  >
                    <View style={styles.rowLabelContainer}>
                      <Ionicons
                        name={isActive ? "image" : "image-outline"}
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
              }

              return (
                <SwipeRow
                  project={item}
                  isActive={item.id === activeProjectId}
                  onSelect={onChangeProject}
                  onDelete={(project) => {
                    Alert.alert(
                      "Excluir projeto",
                      `Remover o projeto "${project.name}"? As fotos permanecem no álbum Komorebi.`,
                      [
                        { text: "Cancelar", style: "cancel" },
                        {
                          text: "Excluir",
                          style: "destructive",
                          onPress: () => onDeleteProject?.(project),
                        },
                      ],
                    );
                  }}
                />
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
