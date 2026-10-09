import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ExifItem } from "./ExifItem";
import { MapViewWeb } from "./MapViewWeb";
import { useSettings } from "../context/SettingsContext";
import { exifHandler } from "../utils/exifFormatter";
import { EXIF_SCHEMA } from "../utils/exifSchema";
import { getProjectAlbumName } from "../utils/projects";
import { loadGalleryPhotos } from "../utils/galleryPhotos";
import ScreenHeader from "./ScreenHeader";
import styles from "./Galery.styles";
import LoadingScreen from "./LoadingScreen";
import ProjectChecklist from "./ProjectChecklist";
import CustomToggle from "./CustoToggle";
import ProjectSwipeList from "./ProjectSwipeList";

import { deleteGalleryPhotos, rateGalleryPhotos, shareGalleryPhotos } from "../utils/galleryActions";
import { retainPhotoSelection, togglePhotoSelection, withGalleryAssets } from "../utils/galleryActionState";
import { addPhotoDepth, cancelPhotoDepth, getPhotoDepthState, revertPhotoDepth, cleanupDeletedDepthBackups, subscribeToPhotoDepth } from "../../modules/camera-photo-depth";
import PhotoDepthScan from "./PhotoDepthScan";
import PhotoRatingControls from "./PhotoRatingControls";
import GalleryActionProgress from "./GalleryActionProgress";

const PHOTOS_PER_ROW = 4;
const INFO_SWIPE_DISTANCE = 56;

const startOfDay = (date) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
};

const getDateKey = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getSectionTitle = (timestamp) => {
  const photoDate = startOfDay(timestamp);
  const daysAgo = Math.round((startOfDay(new Date()) - photoDate) / 86400000);
  if (daysAgo === 0) return "Hoje";
  if (daysAgo === 1) return "Ontem";
  if (daysAgo > 1 && daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
    }).format(photoDate);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(photoDate);
  return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
};

const getViewerDate = (timestamp) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));

const groupPhotosByDate = (photos) => {
  const photosByDate = new Map();
  [...photos]
    .sort((a, b) => b.creationTime - a.creationTime)
    .forEach((photo) => {
      const dateKey = getDateKey(photo.creationTime);
      const group = photosByDate.get(dateKey);
      if (group) group.photos.push(photo);
      else
        photosByDate.set(dateKey, {
          timestamp: photo.creationTime,
          photos: [photo],
        });
    });

  return Array.from(photosByDate.values()).map((group) => {
    const rows = [];
    for (let index = 0; index < group.photos.length; index += PHOTOS_PER_ROW) {
      rows.push(group.photos.slice(index, index + PHOTOS_PER_ROW));
    }
    return { title: getSectionTitle(group.timestamp), data: rows };
  });
};

export default function Galery() {
  const { projects, activeProjectId, setProjects } = useSettings();
  const [viewProjectId, setViewProjectId] = useState(activeProjectId);
  const viewProject = viewProjectId
    ? projects.find((project) => project.id === viewProjectId) || null
    : null;
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const operationRef = useRef(null);
  const mountedRef = useRef(true);
  const [operation, setOperation] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchRatingOpen, setBatchRatingOpen] = useState(false);
  const [depthScan, setDepthScan] = useState(null);
  const [depthState, setDepthState] = useState(null);
  const [depthCreateCopy, setDepthCreateCopy] = useState(false);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const photoLoadGeneration = useRef(0);
  const depthScanRef = useRef(null);
  const pendingLibraryRefresh = useRef(false);
  depthScanRef.current = depthScan;

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const viewerVisibleRef = useRef(false);
  viewerVisibleRef.current = viewerVisible;
  const [infoOpen, setInfoOpen] = useState(false);
  const [intelligentTagsOpen, setIntelligentTagsOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [exifData, setExifData] = useState(null);
  const [exifLoading, setExifLoading] = useState(false);
  const pagerRef = useRef(null);
  const thumbnailRef = useRef(null);
  const infoScrollRef = useRef(null);
  const infoScrollOffset = useRef(0);
  const galleryPhotoRefs = useRef(new Map());
  const closingViewerRef = useRef(false);
  const infoAnimation = useRef(new Animated.Value(0)).current;
  const sharedProgress = useRef(new Animated.Value(0)).current;
  const viewerOpacity = useRef(new Animated.Value(0)).current;
  const [transitionSource, setTransitionSource] = useState(null);
  const [transitionUri, setTransitionUri] = useState(null);
  const [transitionRunning, setTransitionRunning] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();

  const loadKomorebiPhotos = useCallback(
    async (project = viewProject, showLoading = true) => {
      const generation = ++photoLoadGeneration.current;
      const current = () => generation === photoLoadGeneration.current;
      try {
        if (showLoading) setLoading(true);
        const resolved = await loadGalleryPhotos(project, current);
        if (current() && resolved) {
          setPhotos(resolved);
          void cleanupDeletedDepthBackups().catch((error) =>
            console.warn("Falha ao limpar recuperação de fotos apagadas", error),
          );
          return resolved;
        }
      } catch (error) {
        console.log("Erro ao carregar fotos:", error);
      } finally {
        if (current()) setLoading(false);
      }
    },
    [viewProject],
  );

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
      return;
    }
    void loadKomorebiPhotos();
    return () => {
      photoLoadGeneration.current += 1;
    };
  }, [loadKomorebiPhotos, permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted) return;
    let previousState = AppState.currentState;
    const refresh = () => {
      if (operationRef.current?.depth || depthScanRef.current) {
        pendingLibraryRefresh.current = true;
        return;
      }
      void loadKomorebiPhotos(undefined, false);
    };
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && previousState !== "active") refresh();
      previousState = state;
    });
    const librarySubscription = MediaLibrary.addListener(refresh);
    return () => {
      appSubscription.remove();
      librarySubscription.remove();
    };
  }, [permission?.granted, loadKomorebiPhotos]);

  useEffect(() => {
    if (depthScan || operation?.depth || !pendingLibraryRefresh.current) return;
    pendingLibraryRefresh.current = false;
    void loadKomorebiPhotos(undefined, false);
  }, [depthScan, operation, loadKomorebiPhotos]);

  const orderedPhotos = useMemo(
    () => [...photos].sort((a, b) => b.creationTime - a.creationTime),
    [photos],
  );
  const photoSections = useMemo(
    () => groupPhotosByDate(orderedPhotos),
    [orderedPhotos],
  );
  const selectedIndex = useMemo(
    () => orderedPhotos.findIndex((photo) => photo.id === selectedAssetId),
    [orderedPhotos, selectedAssetId],
  );
  const selectedPhoto = orderedPhotos[selectedIndex] || null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (operationRef.current) {
        operationRef.current.cancelled = true;
        if (operationRef.current.depth) void cancelPhotoDepth(operationRef.current.id);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedIds((ids) => retainPhotoSelection(ids, photos));
  }, [photos]);

  const clearSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
    setBatchRatingOpen(false);
  };

  const toggleSelection = (id) => {
    if (operationRef.current) return;
    setSelectedIds((ids) => togglePhotoSelection(ids, id));
  };

  const beginOperation = (label, total, cancellable = true) => {
    if (operationRef.current) return null;
    const job = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, label, total, completed: 0, cancellable, cancelled: false };
    operationRef.current = job;
    setOperation({ ...job });
    return job;
  };
  const reportProgress = (job, progress) => {
    if (mountedRef.current && operationRef.current === job)
      setOperation((previous) => ({ ...previous, ...progress }));
  };
  const finishOperation = (job) => {
    if (operationRef.current !== job) return;
    operationRef.current = null;
    if (mountedRef.current) setOperation(null);
  };
  const cancelOperation = () => {
    const job = operationRef.current;
    if (!job?.cancellable) return;
    job.cancelled = true;
    setOperation((previous) => ({ ...previous, label: "Cancelando", cancellable: false }));
    if (job.depth) void cancelPhotoDepth(job.id);
  };

  const handleRating = async (rating, ids = selectedPhoto ? [selectedPhoto.id] : []) => {
    if (!ids.length) return;
    const job = beginOperation("Salvando classificação", ids.length);
    if (!job) return;
    try {
      const result = await rateGalleryPhotos(ids, rating, {
        isCancelled: () => job.cancelled,
        onProgress: (progress) => reportProgress(job, progress),
        onSaved: (id, value, uri) => {
          if (!mountedRef.current) return;
          photoLoadGeneration.current += 1;
          setPhotos((previous) => previous.map((photo) => photo.id === id
            ? { ...photo, rating: value, uri: uri || photo.uri } : photo));
        },
      });
      if (!mountedRef.current) return;
      if (selecting) {
        setSelectedIds((previous) => new Set([...previous].filter((id) => !result.succeeded.includes(id))));
        setBatchRatingOpen(false);
      }
      if (result.failed.length) Alert.alert("Não foi possível salvar todas as classificações", `${result.succeeded.length} salvas; ${result.failed.length} falharam.${selecting ? " As fotos com falha continuam selecionadas." : " A nota anterior foi mantida."}`);
      if (result.succeeded.length) setMetadataRevision((value) => value + 1);
    } catch (error) {
      Alert.alert("Não foi possível salvar a classificação", error.message);
    } finally {
      finishOperation(job);
      if (mountedRef.current) void loadKomorebiPhotos(undefined, false);
    }
  };

  const handleShare = async (ids) => {
    if (!ids.length) return;
    const job = beginOperation("Preparando compartilhamento", ids.length);
    if (!job) return;
    try {
      await shareGalleryPhotos(ids, {
        isCancelled: () => job.cancelled,
        onProgress: (progress) => reportProgress(job, { ...progress, cancellable: progress.completed < progress.total }),
      });
    } catch (error) {
      if (mountedRef.current) Alert.alert("Não foi possível compartilhar", error.message);
    } finally {
      finishOperation(job);
    }
  };

  useEffect(() => {
    if (operation?.id || !viewerVisible || !infoOpen || !selectedAssetId || Platform.OS !== "ios") return;
    let current = true;
    setDepthState(null);
    getPhotoDepthState(selectedAssetId).then((state) => {
      if (current) setDepthState(state);
    }).catch((error) => {
      if (current) setDepthState({ eligible: false, canRevert: false, reason: error.message });
    });
    return () => { current = false; };
  }, [viewerVisible, infoOpen, selectedAssetId, operation?.id]);

  useEffect(() => {
    setDepthScan((scan) => viewerVisible && scan?.assetId === selectedAssetId ? scan : null);
  }, [selectedAssetId, viewerVisible]);

  const handleDepth = async (revert = false) => {
    if (!selectedPhoto) return;
    const assetId = selectedPhoto.id;
    const job = beginOperation(revert ? "Revertendo profundidade" : "Gerando profundidade", 100);
    if (!job) return;
    job.depth = true;
    reportProgress(job, { depth: true });
    // Discard any grid refresh started before Photos commits the new asset.
    photoLoadGeneration.current += 1;
    setDepthScan(null);
    let previewUri = null;
    const subscription = subscribeToPhotoDepth((event) => {
      if (event.operationId !== job.id) return;
      if (event.previewUri) previewUri = event.previewUri;
      reportProgress(job, { completed: Math.round(event.progress * 100), cancellable: event.cancellable });
    });
    try {
      const createdId = await withGalleryAssets([assetId], () => revert ? revertPhotoDepth(assetId, job.id) : addPhotoDepth(assetId, job.id, { createCopy: depthCreateCopy || !!depthState?.canCopy }));
      if (!mountedRef.current) return;
      if (revert) {
        await loadKomorebiPhotos(undefined, false);
      } else if (createdId && !job.cancelled && viewerVisibleRef.current && !closingViewerRef.current) {
        // The generated portrait has the same upright pixels as its source.
        // Keep those pixels visible immediately, without enumerating the library.
        const createdPhoto = { ...selectedPhoto, id: createdId };
        setPhotos((previous) => createdId === assetId
          ? previous.map((photo) => photo.id === assetId ? createdPhoto : photo)
          : [...previous.filter((photo) => photo.id !== createdId), createdPhoto]);
        setSelectedAssetId(createdId);
        const scan = {
          assetId: createdId,
          uri: previewUri,
          id: job.id,
          ready: false,
          scrollOffset: infoScrollOffset.current,
        };
        depthScanRef.current = scan;
        console.info("[PhotoDepthScan] geração concluída; fechando painel", { hasDepthPreview: !!previewUri });
        setDepthScan(scan);
        pendingLibraryRefresh.current = true;
        // Resolve only this asset; preview errors cannot suppress a confirmed scan.
        void MediaLibrary.getAssetInfoAsync(createdId, { shouldDownloadFromNetwork: false })
          .then((info) => {
            if (!mountedRef.current) return;
            setPhotos((previous) => previous.map((photo) => photo.id === createdId
              ? { ...photo, ...info, id: createdId, uri: info.localUri || info.uri || photo.uri, rating: selectedPhoto.rating }
              : photo));
          })
          .catch((error) => console.warn("Prévia da foto gerada indisponível", error));
      }
      setDepthState(null);
      setMetadataRevision((value) => value + 1);
    } catch (error) {
      if (!job.cancelled && mountedRef.current) Alert.alert("Não foi possível alterar a profundidade", error.message);
    } finally {
      subscription?.remove();
      finishOperation(job);
    }
  };

  const handleChangeViewProject = useCallback(
    (projectId) => {
      if (operationRef.current) return;
      setSelecting(false);
      setSelectedIds(new Set());
      setBatchRatingOpen(false);
      setViewProjectId(projectId);
      loadKomorebiPhotos(projects.find((project) => project.id === projectId));
    },
    [loadKomorebiPhotos, projects],
  );

  const handleCreateProject = useCallback(
    (project) => {
      if (operationRef.current) return;
      setSelecting(false);
      setSelectedIds(new Set());
      setBatchRatingOpen(false);
      setProjects((previous) => [...previous, project]);
      setViewProjectId(project.id);
      loadKomorebiPhotos(project);
    },
    [loadKomorebiPhotos, setProjects],
  );

  const handleDeleteProject = useCallback(
    async (project) => {
      if (operationRef.current) return;
      try {
        const albums = await MediaLibrary.getAlbumsAsync();
        const album = albums.find(
          (item) => item.title === getProjectAlbumName(project),
        );
        if (album) await MediaLibrary.deleteAlbumsAsync(album, false);
        setProjects((previous) =>
          previous.filter((item) => item.id !== project.id),
        );
        if (viewProjectId === project.id) {
          setSelecting(false);
          setSelectedIds(new Set());
          setBatchRatingOpen(false);
          setViewProjectId(null);
          loadKomorebiPhotos(null);
        }
      } catch (error) {
        console.warn("Erro ao excluir projeto:", error);
      }
    },
    [loadKomorebiPhotos, setProjects, viewProjectId],
  );

  const setInfoPanel = useCallback(
    (open, onFinished, preserveContents = false) => {
      setInfoOpen(open);
      if (!open && !preserveContents) setIntelligentTagsOpen(false);
      Animated.spring(infoAnimation, {
        toValue: open ? 1 : 0,
        damping: 24,
        stiffness: 230,
        mass: 0.9,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinished?.();
      });
    },
    [infoAnimation],
  );

  // Wait for the panel and photo transform to settle before mounting the scan.
  const scanId = depthScan?.id;
  const scanAssetId = depthScan?.assetId;
  useEffect(() => {
    if (!scanId || !viewerVisible || scanAssetId !== selectedAssetId) return;
    let current = true;
    pagerRef.current?.scrollToOffset({ offset: selectedIndex * screenWidth, animated: false });
    setInfoPanel(false, () => {
      if (current && !closingViewerRef.current) {
        console.info("[PhotoDepthScan] painel fechado; iniciando scan");
        setDepthScan((scan) => scan?.id === scanId ? { ...scan, ready: true } : scan);
      }
    }, true);
    return () => { current = false; };
  }, [scanId, scanAssetId, viewerVisible, selectedAssetId, selectedIndex, screenWidth, setInfoPanel]);

  const finishDepthScan = (id) => {
    if (depthScan?.id !== id || !viewerVisible || closingViewerRef.current) return;
    const offset = depthScan.scrollOffset;
    console.info("[PhotoDepthScan] scan concluído; reabrindo informações");
    setDepthScan(null);
    setInfoPanel(true, () => infoScrollRef.current?.scrollTo({ y: offset, animated: false }));
  };

  const measureGalleryPhoto = useCallback((assetId, callback) => {
    const node = galleryPhotoRefs.current.get(assetId);
    if (!node?.measureInWindow) {
      callback(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      callback(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  }, []);

  const closeViewer = useCallback(() => {
    if (closingViewerRef.current || !selectedPhoto) return;
    closingViewerRef.current = true;
    setDepthScan(null);
    setInfoPanel(false);

    measureGalleryPhoto(selectedPhoto.id, (measuredRect) => {
      setTransitionSource((previous) => measuredRect || previous);
      setTransitionUri(selectedPhoto.uri);
      setTransitionRunning(true);
      viewerOpacity.setValue(0);
      sharedProgress.setValue(1);

      requestAnimationFrame(() => {
        Animated.timing(sharedProgress, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          setViewerVisible(false);
          setTransitionRunning(false);
          closingViewerRef.current = false;
        });
      });
    });
  }, [
    measureGalleryPhoto,
    selectedPhoto,
    setInfoPanel,
    sharedProgress,
    viewerOpacity,
  ]);

  const openViewer = useCallback(
    (photo) => {
      const index = orderedPhotos.findIndex((item) => item.id === photo.id);
      measureGalleryPhoto(photo.id, (measuredRect) => {
        setTransitionSource(
          measuredRect || {
            x: screenWidth / 2,
            y: screenHeight / 2,
            width: 1,
            height: 1,
          },
        );
        setTransitionUri(photo.uri);
        setTransitionRunning(true);
        sharedProgress.setValue(0);
        viewerOpacity.setValue(0);
        setExifData(null);
        setSelectedAssetId(photo.id);
        setViewerVisible(true);
        requestAnimationFrame(() => {
          pagerRef.current?.scrollToOffset({
            offset: Math.max(index, 0) * screenWidth,
            animated: false,
          });
        });
      });
    },
    [
      measureGalleryPhoto,
      orderedPhotos,
      screenHeight,
      screenWidth,
      sharedProgress,
      viewerOpacity,
    ],
  );

  const selectPhotoAtIndex = useCallback(
    (index) => {
      const photo = orderedPhotos[index];
      if (operationRef.current || depthScan || !photo || photo.id === selectedAssetId) return;
      setInfoPanel(false);
      setIntelligentTagsOpen(false);
      setExifData(null);
      setSelectedAssetId(photo.id);
      thumbnailRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    },
    [depthScan, orderedPhotos, selectedAssetId, setInfoPanel],
  );

  const handlePagerScrollEnd = useCallback(
    (event) => {
      const index = Math.round(
        event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
      );
      selectPhotoAtIndex(index);
    },
    [screenWidth, selectPhotoAtIndex],
  );

  const selectThumbnail = useCallback(
    (index) => {
      if (operationRef.current) return;
      pagerRef.current?.scrollToOffset({
        offset: index * screenWidth,
        animated: true,
      });
      selectPhotoAtIndex(index);
    },
    [screenWidth, selectPhotoAtIndex],
  );

  const handleViewerShow = useCallback(() => {
    if (selectedIndex < 0) return;
    pagerRef.current?.scrollToOffset({
      offset: selectedIndex * screenWidth,
      animated: false,
    });
    thumbnailRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: false,
      viewPosition: 0.5,
    });
    Animated.timing(sharedProgress, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      viewerOpacity.setValue(1);
      setTransitionRunning(false);
    });
  }, [screenWidth, selectedIndex, sharedProgress, viewerOpacity]);

  useEffect(() => {
    if (viewerVisible && selectedIndex < 0) {
      setInfoPanel(false);
      setViewerVisible(false);
      setTransitionRunning(false);
      closingViewerRef.current = false;
    }
  }, [viewerVisible, selectedIndex, setInfoPanel]);

  const viewerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dy) > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.25,
        onPanResponderRelease: (_, gesture) => {
          if (!depthScan && (gesture.dy < -INFO_SWIPE_DISTANCE || gesture.vy < -0.55))
            setInfoPanel(true);
        },
      }),
    [depthScan, setInfoPanel],
  );

  useEffect(() => {
    if (!viewerVisible || !selectedAssetId) return undefined;
    let current = true;
    setExifData(null);
    setExifLoading(true);
    exifHandler(selectedAssetId, (data) => {
      if (!current) return;
      setExifData(data);
      setExifLoading(false);
    });
    return () => {
      current = false;
    };
  }, [selectedAssetId, viewerVisible, metadataRevision]);

  const handleDeletePhoto = (ids = selectedAssetId ? [selectedAssetId] : []) => {
    if (!ids.length || operationRef.current) return;
    const snapshot = [...ids];
    Alert.alert(
      snapshot.length === 1 ? "Apagar foto?" : `Apagar ${snapshot.length} fotos?`,
      "As fotos serão apagadas da biblioteca do dispositivo e de todos os álbuns.",
      [{ text: "Cancelar", style: "cancel" }, { text: "Apagar", style: "destructive", onPress: async () => {
        const job = beginOperation("Apagando fotos", snapshot.length, false);
        if (!job) return;
        try {
          const deleted = await deleteGalleryPhotos(snapshot);
          if (!deleted || !mountedRef.current) return;
          if (snapshot.includes(selectedAssetId) && viewerVisible) closeViewer();
          setSelectedIds((previous) => new Set([...previous].filter((id) => !snapshot.includes(id))));
          await cleanupDeletedDepthBackups(snapshot).catch((error) => console.warn("Falha ao limpar recuperação", error));
        } catch (error) {
          if (mountedRef.current) Alert.alert("Não foi possível apagar", error.message);
        } finally {
          finishOperation(job);
          if (mountedRef.current) void loadKomorebiPhotos(undefined, false);
        }
      } }],
    );
  };

  const navigationHeader = (
    <ScreenHeader
      title={selecting ? `${selectedIds.size} ${selectedIds.size === 1 ? "selecionada" : "selecionadas"}` : "Galeria"}
      right={permission?.granted ? (
        <View pointerEvents={operation ? "none" : "auto"} style={operation && styles.disabledAction}>
        <ProjectSwipeList
          projects={projects}
          activeProjectId={viewProjectId}
          onChangeProject={handleChangeViewProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          includeNoneOption
          noneOptionLabel="Todas as fotos"
        />
        </View>
      ) : null}
    />
  );
  if (!permission || (loading && permission.granted)) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        {navigationHeader}
        <View style={styles.loadingContent}>
          <LoadingScreen />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        {navigationHeader}
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Permissão para acessar fotos é necessária.
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Permitir acesso</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const panelTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [screenHeight, 0],
  });
  const photoTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.min(screenHeight * 0.2, 180)],
  });
  const photoScale = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.64],
  });
  const chromeTranslateY = infoAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  });
  const viewerPhotoTarget = {
    x: 12,
    y: safeAreaInsets.top + 72,
    width: screenWidth - 24,
    height: Math.max(
      screenHeight - safeAreaInsets.top - 238,
      screenHeight * 0.45,
    ),
  };
  const transitionImageStyle = transitionSource
    ? {
        borderRadius: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [19, 28],
        }),
        height: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.height, viewerPhotoTarget.height],
        }),
        left: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.x, viewerPhotoTarget.x],
        }),
        top: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.y, viewerPhotoTarget.y],
        }),
        width: sharedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [transitionSource.width, viewerPhotoTarget.width],
        }),
      }
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="light" />

      {navigationHeader}
      <View style={styles.selectionToolbar}>
        <TouchableOpacity accessibilityRole="button" disabled={!!operation} onPress={selecting ? clearSelection : () => setSelecting(true)} style={styles.selectionButton}>
          <Text style={styles.infoActionText}>{selecting ? "Cancelar seleção" : "Selecionar"}</Text>
        </TouchableOpacity>
        {selecting && [
          ["Avaliar", () => setBatchRatingOpen(true)],
          ["Compartilhar", () => handleShare([...selectedIds])],
          ["Apagar", () => handleDeletePhoto([...selectedIds])],
        ].map(([label, onPress]) => (
          <TouchableOpacity key={label} accessibilityRole="button" disabled={!!operation || !selectedIds.size} onPress={onPress} style={[styles.selectionButton, (!!operation || !selectedIds.size) && styles.disabledAction]}>
            <Text style={label === "Apagar" ? styles.dangerText : styles.infoActionText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!viewerVisible && !batchRatingOpen && <GalleryActionProgress operation={operation} onCancel={cancelOperation} />}

      <SectionList
        sections={photoSections}
        extraData={{ selectedIds, selecting, operation }}
        keyExtractor={(row) => row.map((photo) => photo.id).join("-")}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.photoRow}>
            {row.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                ref={(node) => {
                  if (node) galleryPhotoRefs.current.set(photo.id, node);
                  else galleryPhotoRefs.current.delete(photo.id);
                }}
                activeOpacity={0.82}
                style={styles.photoItem}
                accessibilityRole={selecting ? "checkbox" : "button"}
                accessibilityLabel={selecting ? "Selecionar foto" : "Abrir foto"}
                accessibilityState={{ checked: selecting ? selectedIds.has(photo.id) : undefined, disabled: !!operation }}
                disabled={!!operation}
                onLongPress={() => { setSelecting(true); toggleSelection(photo.id); }}
                onPress={() => selecting ? toggleSelection(photo.id) : openViewer(photo)}
              >
                <Image source={{ uri: photo.uri }} style={styles.image} />
                {selecting && <View style={styles.selectionBadge}><Ionicons name={selectedIds.has(photo.id) ? "checkmark-circle" : "ellipse-outline"} size={25} color={selectedIds.has(photo.id) ? "#ffaa00" : "#fff"} /></View>}
                {photo.rating > 0 && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={10} color="#ffaa00" />
                    <Text style={styles.ratingBadgeText}>{photo.rating}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            {Array.from({ length: PHOTOS_PER_ROW - row.length }).map(
              (_, index) => (
                <View key={`empty-${index}`} style={styles.photoPlaceholder} />
              ),
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Sua galeria está vazia</Text>
            <Text style={styles.emptyText}>
              As fotos feitas com a Komorebi aparecerão aqui.
            </Text>
          </View>
        }
      />

      <Modal visible={batchRatingOpen} transparent animationType="fade" onRequestClose={() => !operation && setBatchRatingOpen(false)}>
        <View style={styles.batchModalBackdrop}>
          <View style={styles.batchModalContent}>
            <Text style={styles.infoTitle}>Avaliar {selectedIds.size} fotos</Text>
            <PhotoRatingControls disabled={!!operation || !selectedIds.size} onRate={(rating) => handleRating(rating, [...selectedIds])} />
            <GalleryActionProgress operation={operation} onCancel={cancelOperation} />
            <TouchableOpacity disabled={!!operation} onPress={() => setBatchRatingOpen(false)} style={styles.selectionButton}><Text style={styles.infoActionText}>Fechar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="none"
        onRequestClose={infoOpen ? () => setInfoPanel(false) : closeViewer}
        onShow={handleViewerShow}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={viewerVisible}
      >
        <View style={styles.viewer}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.viewerTransitionBackdrop,
              { opacity: sharedProgress },
            ]}
          />
          <Animated.View
            pointerEvents={transitionRunning ? "none" : "auto"}
            style={[styles.viewerContent, { opacity: viewerOpacity }]}
          >
            <View
              style={[
                styles.viewerTopBar,
                { paddingTop: safeAreaInsets.top + 8 },
              ]}
            >
              {operation && !infoOpen && (
                <View style={[styles.viewerOperation, { top: safeAreaInsets.top + 60 }]}>
                  <GalleryActionProgress operation={operation} onCancel={cancelOperation} />
                </View>
              )}
              <TouchableOpacity
                accessibilityLabel="Fechar foto"
                accessibilityRole="button"
                onPress={infoOpen ? () => setInfoPanel(false) : closeViewer}
                style={styles.viewerRoundButton}
              >
                <Ionicons name="chevron-back" size={25} color="#fff" />
              </TouchableOpacity>
              <View style={styles.viewerHeading}>
                <Text style={styles.viewerDate} numberOfLines={1}>
                  {selectedPhoto
                    ? getViewerDate(selectedPhoto.creationTime)
                    : ""}
                </Text>
                <Text style={styles.viewerCounter}>
                  {selectedIndex + 1} de {orderedPhotos.length}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Informações da foto"
                accessibilityRole="button"
                disabled={!!depthScan}
                onPress={() => setInfoPanel(true)}
                style={styles.viewerRoundButton}
              >
                <Ionicons name="information" size={23} color="#fff" />
              </TouchableOpacity>
            </View>

            <Animated.View
              style={[
                styles.viewerGestureArea,
                {
                  paddingTop: safeAreaInsets.top + 60,
                  transform: [
                    { translateY: photoTranslateY },
                    { scale: photoScale },
                  ],
                },
              ]}
            >
              <FlatList
                ref={pagerRef}
                data={orderedPhotos}
                horizontal
                pagingEnabled
                directionalLockEnabled
                disableIntervalMomentum
                scrollEnabled={!operation && !depthScan && orderedPhotos.length > 1}
                extraData={depthScan}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(photo) => photo.id}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                onMomentumScrollEnd={handlePagerScrollEnd}
                renderItem={({ item: photo }) => (
                  <View
                    style={[styles.viewerPhotoPage, { width: screenWidth }]}
                  >
                    <View
                      style={styles.viewerPhotoFrame}
                      {...viewerPanResponder.panHandlers}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        resizeMode="cover"
                        style={styles.viewerPhoto}
                      />
                      {viewerVisible && !infoOpen && depthScan?.ready && photo.id === selectedAssetId && depthScan.assetId === photo.id && (
                        <PhotoDepthScan
                          key={depthScan.id}
                          uri={depthScan.uri}
                          onComplete={() => finishDepthScan(depthScan.id)}
                        />
                      )}
                    </View>
                  </View>
                )}
              />
            </Animated.View>

            <Animated.View
              pointerEvents={infoOpen ? "none" : "auto"}
              style={[
                styles.viewerBottom,
                {
                  opacity: infoAnimation.interpolate({
                    inputRange: [0, 0.7],
                    outputRange: [1, 0],
                  }),
                  paddingBottom: Math.max(safeAreaInsets.bottom, 14),
                  transform: [{ translateY: chromeTranslateY }],
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setInfoPanel(true)}
                disabled={!!depthScan}
                style={styles.infoHandleButton}
              >
                <View style={styles.infoHandle} />
                <View style={styles.infoButtonContent}>
                  <Ionicons name="chevron-up" size={17} color="#ffaa00" />
                  <Text style={styles.infoButtonText}>Detalhes da foto</Text>
                </View>
              </TouchableOpacity>
              <FlatList
                ref={thumbnailRef}
                data={orderedPhotos}
                horizontal
                initialScrollIndex={Math.max(selectedIndex, 0)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailList}
                keyExtractor={(photo) => `thumbnail-${photo.id}`}
                getItemLayout={(_, index) => ({
                  length: 58,
                  offset: 58 * index,
                  index,
                })}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    thumbnailRef.current?.scrollToIndex({
                      index,
                      animated: false,
                      viewPosition: 0.5,
                    });
                  }, 100);
                }}
                renderItem={({ item, index }) => {
                  const active = item.id === selectedAssetId;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={!!operation || !!depthScan}
                      onPress={() => selectThumbnail(index)}
                      style={[
                        styles.thumbnailButton,
                        active && styles.thumbnailButtonActive,
                      ]}
                    >
                      <Image
                        source={{ uri: item.uri }}
                        style={styles.thumbnailImage}
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>

            <Animated.View
              pointerEvents={infoOpen ? "auto" : "none"}
              style={[styles.infoBackdrop, { opacity: infoAnimation }]}
            >
              <Pressable
                accessibilityLabel="Fechar informações"
                onPress={() => setInfoPanel(false)}
                style={styles.infoBackdropPressable}
              />
            </Animated.View>

            <Animated.View
              pointerEvents={infoOpen ? "auto" : "none"}
              style={[
                styles.infoPanel,
                {
                  transform: [{ translateY: panelTranslateY }],
                },
              ]}
            >
              <BlurView intensity={72} tint="dark" style={styles.infoPanelBlur}>
                <View style={styles.infoPanelHandle} />
                <View style={styles.infoHeader}>
                  <View style={styles.infoHeaderCopy}>
                    <Text style={styles.infoEyebrow}>
                      FOTO {selectedIndex + 1}
                    </Text>
                    <Text style={styles.infoTitle}>Detalhes da foto</Text>
                    <Text style={styles.infoSubtitle}>
                      {selectedPhoto?.creationTime ? getViewerDate(selectedPhoto.creationTime) : "Informações e ações"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Fechar informações"
                    onPress={() => setInfoPanel(false)}
                    style={styles.infoCloseButton}
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <GalleryActionProgress operation={operation} onCancel={cancelOperation} />
                <ScrollView
                  ref={infoScrollRef}
                  onScroll={(event) => { infoScrollOffset.current = event.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                  contentContainerStyle={[styles.infoScrollContent, { paddingBottom: Math.max(safeAreaInsets.bottom, 20) + 16 }]}
                  showsVerticalScrollIndicator={false}
                >
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!!operation}
                    style={[styles.primaryPhotoAction, !!operation && styles.disabledAction]}
                    onPress={() => selectedPhoto && handleShare([selectedPhoto.id])}
                  >
                    <Ionicons name="share-outline" size={20} color="#171717" />
                    <Text style={styles.primaryPhotoActionText}>Compartilhar foto</Text>
                    <Ionicons name="arrow-forward" size={18} color="#171717" />
                  </TouchableOpacity>
                  <Text style={styles.infoSectionLabel}>CAPTURA</Text>
                  {exifLoading ? (
                    <View style={styles.photoDataLoading}>
                      <ActivityIndicator color="#ffaa00" size="small" />
                      <Text style={styles.loadingText}>Lendo metadados…</Text>
                    </View>
                  ) : exifData ? (
                    <>
                      {exifData.komorebiBadges?.length ? (
                        <View style={styles.badgeContainer}>
                          {exifData.komorebiBadges.map((badge) => (
                            <View key={badge} style={styles.badge}>
                              <Text style={styles.badgeText}>{badge}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {["iso", "aperture", "shutter"].some((key) => exifData[key] != null && exifData[key] !== "") && (
                        <View style={styles.captureMetrics}>
                          {["iso", "aperture", "shutter"].map((key, index) => (
                            <View key={key} style={[styles.captureMetric, index > 0 && styles.captureMetricDivider]}>
                              <Text style={styles.captureMetricLabel}>{EXIF_SCHEMA[key].label}</Text>
                              <Text style={styles.captureMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {exifData[key] == null || exifData[key] === "" ? "—" : String(exifData[key])}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={styles.exifContainer}>
                        {Object.entries(EXIF_SCHEMA).map(([key, config]) => {
                          const value = exifData[key];
                          if (
                            value == null || value === "" ||
                            ["iso", "aperture", "shutter"].includes(key) ||
                            key === "latitude" ||
                            key === "longitude"
                          )
                            return null;
                          return (
                            <View
                              key={key}
                              style={[
                                styles.exifItemWrapper,
                                ["date", "lens"].includes(key) && styles.exifItemWide,
                              ]}
                            >
                              <ExifItem
                                icon={config.icon}
                                label={config.label}
                                value={String(value)}
                              />
                            </View>
                          );
                        })}
                      </View>

                      {exifData.intelligentTags?.length ? (
                        <View style={styles.intelligentTagsSection}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityState={{
                              expanded: intelligentTagsOpen,
                            }}
                            onPress={() =>
                              setIntelligentTagsOpen((open) => !open)
                            }
                            style={styles.intelligentTagsHeader}
                          >
                            <View style={styles.intelligentTagsTitleRow}>
                              <Ionicons
                                name="sparkles-outline"
                                size={17}
                                color="#ffaa00"
                              />
                              <Text style={styles.intelligentTagsTitle}>
                                Tags inteligentes
                              </Text>
                              <View style={styles.intelligentTagsCount}>
                                <Text style={styles.intelligentTagsCountText}>
                                  {exifData.intelligentTags.length}
                                </Text>
                              </View>
                            </View>
                            <Ionicons
                              name={
                                intelligentTagsOpen
                                  ? "chevron-up"
                                  : "chevron-down"
                              }
                              size={18}
                              color="rgba(255,255,255,0.58)"
                            />
                          </TouchableOpacity>
                          {intelligentTagsOpen ? (
                            <View style={styles.intelligentTagsChips}>
                              {exifData.intelligentTags.map((tag) => (
                                <View
                                  key={tag}
                                  style={styles.intelligentTagChip}
                                >
                                  <Text style={styles.intelligentTagText}>
                                    {tag}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {(exifData.latitude ?? exifData.GPSLatitude) != null &&
                      (exifData.longitude ?? exifData.GPSLongitude) != null ? (
                        <View pointerEvents="none" style={styles.mapContainer}>
                          <MapViewWeb
                            latitude={Number(
                              exifData.latitude ?? exifData.GPSLatitude,
                            )}
                            longitude={Number(
                              exifData.longitude ?? exifData.GPSLongitude,
                            )}
                          />
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.noMetadataText}>
                      Nenhum metadado disponível para esta foto.
                    </Text>
                  )}

                  <Text style={styles.infoSectionLabel}>ORGANIZAR</Text>
                  <View style={styles.photoActionGroup}>
                    <PhotoRatingControls rating={selectedPhoto?.rating} disabled={!!operation} onRate={handleRating} />
                    <ProjectChecklist
                      assetId={selectedPhoto?.id}
                      projects={projects}
                      onProjectsChange={loadKomorebiPhotos}
                      onCreateProject={(project) =>
                        setProjects((previous) => [...previous, project])
                      }
                      triggerText="Adicionar a um projeto"
                      disabled={!!operation}
                      triggerStyle={[styles.infoActionButton, !!operation && styles.disabledAction]}
                      triggerTextStyle={styles.projectActionText}
                    />
                  </View>
                  <Text style={styles.infoSectionLabel}>CRIAR E EDITAR</Text>
                  <View style={styles.photoActionGroup}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={!!operation}
                      style={[styles.actionRow, !!operation && styles.disabledAction]}
                      onPress={() => {
                        const photoUri = selectedPhoto?.uri;
                        closeViewer();
                        router.push({
                          pathname: "components/ExifFrameWithPhoto",
                          params: { photoUri },
                        });
                      }}
                    >
                      <View style={styles.actionIcon}><Ionicons name="image-outline" size={20} color="#ffaa00" /></View>
                      <View style={styles.actionCopy}>
                        <Text style={styles.actionLabel}>Moldura EXIF</Text>
                        <Text style={styles.actionSubtitle}>Componha a foto com os dados da captura</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={17} color="#777777" />
                    </TouchableOpacity>

                      {Platform.OS === "ios" && <>
                        {depthState?.eligible && <View style={styles.copyOption}>
                          <CustomToggle
                            grouped
                            last
                            label="Criar uma cópia"
                            description={depthCreateCopy ? "Mantém a original e salva uma nova foto." : "Aplica na original, com opção de reverter."}
                            value={depthCreateCopy}
                            onValueChange={setDepthCreateCopy}
                            disabled={!!operation}
                          />
                        </View>}
                        <TouchableOpacity accessibilityRole="button" disabled={!!operation || (depthState?.requiresCopy && !depthCreateCopy) || !(depthState?.eligible || depthState?.canRevert || depthState?.canCopy)} style={[styles.actionRow, styles.actionDivider, (!!operation || (depthState?.requiresCopy && !depthCreateCopy) || !(depthState?.eligible || depthState?.canRevert || depthState?.canCopy)) && styles.disabledAction]} onPress={() => {
                          if (depthState?.canRevert && !depthState?.canCopy) Alert.alert("Reverter profundidade?", "A versão anterior será restaurada, mantendo a classificação atual.", [{ text: "Cancelar", style: "cancel" }, { text: "Reverter", onPress: () => handleDepth(true) }]);
                          else void handleDepth();
                        }}>
                          <View style={styles.actionIcon}><Ionicons name="layers-outline" size={20} color="#ffaa00" /></View>
                          <Text style={styles.actionLabel}>{depthState?.canCopy ? "Salvar cópia para Retrato" : depthState?.canRevert ? "Reverter profundidade" : depthCreateCopy ? "Criar cópia com profundidade" : "Aplicar profundidade na original"}</Text>
                        </TouchableOpacity>
                        <Text style={styles.actionExplanation}>{depthState?.reason || "Verificando disponibilidade…"}</Text>
                        {depthState?.canCopy && <TouchableOpacity accessibilityRole="button" disabled={!!operation} style={[styles.actionRow, !!operation && styles.disabledAction]} onPress={() => Alert.alert("Reverter profundidade?", "A versão anterior será restaurada, mantendo a classificação atual.", [{ text: "Cancelar", style: "cancel" }, { text: "Reverter", onPress: () => handleDepth(true) }])}>
                          <View style={styles.actionIcon}><Ionicons name="arrow-undo-outline" size={20} color="#ffaa00" /></View>
                          <Text style={styles.actionLabel}>Reverter profundidade</Text>
                        </TouchableOpacity>}
                        {depthState?.canRevert && <Text style={styles.actionExplanation}>A recuperação da versão anterior depende dos dados deste app. Desinstalar o Komorebi remove essa recuperação.</Text>}
                      </>}
                  </View>

                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!!operation}
                    style={[styles.deletePhotoButton, !!operation && styles.disabledAction]}
                    onPress={() => selectedPhoto && handleDeletePhoto([selectedPhoto.id])}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ff6868" />
                    <Text style={styles.dangerText}>Excluir foto</Text>
                  </TouchableOpacity>
                </ScrollView>
              </BlurView>
            </Animated.View>
          </Animated.View>

          {transitionRunning && transitionUri && transitionImageStyle ? (
            <Animated.Image
              pointerEvents="none"
              resizeMode="cover"
              source={{ uri: transitionUri }}
              style={[styles.viewerTransitionImage, transitionImageStyle]}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
