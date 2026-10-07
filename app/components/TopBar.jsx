import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Animated as FadeAnimated, Text, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";
import Animated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import FileFormatSelector from "./FileFormatSelector";
import AspectRatioSelector from "./AspectRatioSelector";
import ProjectSelector from "./ProjectSelector";
import PhotoWeather from "./PhotoWeather";
import ImageStackingSelector from "./ImageStackingSelector";
import ImageStackingStatus from "./ImageStackingStatus";
import CaptureTimerSelector from "./CaptureTimerSelector";
import styles from "./TopBar.styles";

export default function TopBar({
  flash,
  toggleFlash,
  toggleMode,
  activeControl,
  selectedLutId,
  smileDetectionEnabled,
  toggleSmileDetectionEnabled,
  doubleCaptureMode,
  toggleDoubleCaptureMode,
  aspectRatio,
  onSelectAspectRatio,
  topBarControls = [],
  firstTime,
  manualControlsAvailable,
  manualMode,
  rawCaptureAvailable,
  rawMode,
  photoFormat,
  processedEnabled,
  supportedRawModes,
  heifPlusAvailable,
  onSelectPhotoFormat,
  onToggleFileFormat,
  onSelectRawMode,
  livePhotoAvailable,
  livePhotoEnabled,
  toggleLivePhotoEnabled,
  portraitCaptureAvailable,
  portraitModeEnabled,
  togglePortraitModeEnabled,
  imageStackingAvailable,
  imageStackingStrategyId,
  imageStackingSupportedStrategies,
  onSelectImageStackingStrategy,
  unavailableReasons = {},
  projects = [],
  activeProjectId,
  onChangeProject,
  onCreateProject,
  controlsDisabled = false,
  stackingProgress,
  onCancelStacking,
  notice,
  captureTimerSeconds = 0,
  onSelectCaptureTimer,
  countdownRemaining = 0,
  onCancelCountdown,
}) {
  const countingDown = countdownRemaining > 0;
  const noticeVisible = Boolean(notice?.message) && !controlsDisabled && !countingDown;
  const router = useRouter();
  const animatedStyle = useDeviceOrientation();
  const [formatOpen, setFormatOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [stackingOpen, setStackingOpen] = useState(false);
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [data, setData] = useState(null);
  const [place, setPlace] = useState(null);
  const [coords, setCoords] = useState(null);
  const weatherEnabled = !firstTime && topBarControls.includes("weather");

  useEffect(() => {
    if (!countingDown) return;
    setTimerOpen(false);
    setFormatOpen(false);
    setOpen(false);
    setStackingOpen(false);
    setAspectRatioOpen(false);
  }, [countingDown]);

  useEffect(() => {
    if (!weatherEnabled) return;
    let active = true;

    const loadLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (status !== "granted") {
        console.warn("Permissão de localização negada");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      if (!active) return;
      setCoords({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
      });
    };
    void loadLocation().catch((error) =>
      console.error("Falha ao obter localização do clima:", error),
    );
    return () => {
      active = false;
    };
  }, [weatherEnabled]);

  useEffect(() => {
    if (!coords || !weatherEnabled) return;
    const controller = new AbortController();

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,cloud_cover,wind_speed_10m,precipitation&daily=sunrise,sunset&timezone=auto`,
      { signal: controller.signal },
    )
      .then((res) => res.json())
      .then((json) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, [coords, weatherEnabled]);

  useEffect(() => {
    if (!coords || !weatherEnabled) return;
    const controller = new AbortController();

    fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=pt`,
      { signal: controller.signal },
    )
      .then((res) => res.json())
      .then((json) => {
        if (controller.signal.aborted) return;
        setPlace({
          city: json.city || json.locality || "Localização desconhecida",
          region: json.principalSubdivision || "",
          country: json.countryName || "",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, [coords, weatherEnabled]);

  const controlOptions = {
    timer: {
      icon: "timer-outline",
      active: captureTimerSeconds > 0,
      onPress: () => setTimerOpen(true),
    },
    aspectRatio: {
      icon: "crop-outline",
      onPress: () => toggleMode("zoom"),
      active: activeControl === "zoom",
    },
    weather: {
      icon: "cloud-outline",
      onPress: () => setOpen(true),
      active: false,
    },
    luts: {
      icon: "color-filter-outline",
      onPress: () => toggleMode("lut"),
      active: activeControl === "lut" || selectedLutId !== "none",
    },
    settings: {
      icon: "settings-outline",
      onPress: () => router.push("components/Settings"),
      active: false,
    },
    smile: {
      icon: "happy-outline",
      onPress: toggleSmileDetectionEnabled,
      active: smileDetectionEnabled,
    },
    vertical: {
      icon: "crop-outline",
      onPress: () => setAspectRatioOpen(true),
      active: aspectRatio !== "4:3",
    },
    doubleCapture: {
      icon: "layers-outline",
      onPress: toggleDoubleCaptureMode,
      active: doubleCaptureMode,
    },
    flash: {
      icon: flash === "off" ? "flash-off-outline" : "flash-outline",
      onPress: toggleFlash,
      active: flash !== "off",
    },
    manual: {
      icon: "options-outline",
      onPress: () => toggleMode("manual"),
      active: activeControl === "manual" || manualMode === "manual",
    },
    rawCapture: {
      icon: rawMode === "off" ? "aperture-outline" : "aperture",
      label:
        rawMode !== "off"
          ? processedEnabled
            ? photoFormat === "jpeg"
              ? "RAW+J"
              : "RAW+H"
            : "RAW"
          : photoFormat === "heifPlus"
            ? "HEIF+"
            : photoFormat === "heif"
              ? "HEIF"
              : "JPEG",
      onPress: () => setFormatOpen(true),
      active: rawMode !== "off",
    },
    livePhoto: {
      icon: livePhotoEnabled ? "radio-button-on" : "radio-button-on-outline",
      symbol: livePhotoEnabled ? "livephoto" : "livephoto.slash",
      onPress: toggleLivePhotoEnabled,
      active: livePhotoEnabled,
    },
    portrait: {
      icon: portraitModeEnabled ? "person" : "person-outline",
      symbol: portraitModeEnabled
        ? "f.cursive.circle.fill"
        : "f.cursive.circle",
      onPress: togglePortraitModeEnabled,
      active: portraitModeEnabled,
    },
    stacking: {
      icon: imageStackingStrategyId ? "layers" : "layers-outline",
      onPress: () => setStackingOpen(true),
      active: Boolean(imageStackingStrategyId),
    },
    projects: {
      icon: activeProjectId ? "folder" : "folder-outline",
      onPress: () => {},
      active: Boolean(activeProjectId),
    },
  };

  return (
    <View style={styles.container}>
      <FadeAnimated.View
        style={[
          styles.buttonsContainer,
          noticeVisible && {
            opacity: notice.opacity.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          },
        ]}
        pointerEvents={noticeVisible ? "none" : "auto"}
        accessibilityElementsHidden={noticeVisible}
        importantForAccessibility={noticeVisible ? "no-hide-descendants" : "auto"}
      >
        {countingDown ? (
          <View style={styles.countdown}>
            <Text style={styles.noticeText} numberOfLines={1} accessibilityLiveRegion="polite">
              Foto em {countdownRemaining} s
            </Text>
            <TouchableOpacity
              onPress={onCancelCountdown}
              style={styles.cancelCountdown}
              accessibilityRole="button"
              accessibilityLabel="Cancelar timer"
            >
              <Ionicons name="close-circle-outline" size={26} color="white" />
            </TouchableOpacity>
          </View>
        ) : controlsDisabled ? (
          <ImageStackingStatus
            progress={stackingProgress}
            onCancel={onCancelStacking}
          />
        ) : (
          topBarControls.map((controlId) => {
            if (controlId === "stacking" && !imageStackingAvailable) return null;
            if (controlId === "manual" && !manualControlsAvailable) return null;
            const control = controlOptions[controlId];
            if (!control) return null;

            const disabled =
              controlsDisabled ||
              (controlId === "flash" && Boolean(unavailableReasons.flash)) ||
              (controlId === "manual" && Boolean(unavailableReasons.manual)) ||
              (controlId === "stacking" && !imageStackingAvailable) ||
              (controlId === "livePhoto" && !livePhotoAvailable) ||
              (controlId === "portrait" && !portraitCaptureAvailable);
            const unavailableReason = unavailableReasons[controlId];
            const iconColor = control.active ? "#ffaa00" : "white";

            if (controlId === "timer") {
              return (
                <Animated.View key={controlId} style={animatedStyle}>
                  <Popover
                    isVisible={timerOpen}
                    onRequestClose={() => setTimerOpen(false)}
                    backgroundStyle={{ backgroundColor: "transparent" }}
                    popoverStyle={{ backgroundColor: "transparent" }}
                    from={
                      <TouchableOpacity
                        style={[styles.controlButton, control.active && styles.controlButtonActive]}
                        onPress={control.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={`Timer: ${captureTimerSeconds ? `${captureTimerSeconds} segundos` : "desligado"}`}
                      >
                        <Ionicons name="timer-outline" size={24} color={iconColor} />
                        {control.active && <Text style={styles.timerLabel}>{captureTimerSeconds}</Text>}
                      </TouchableOpacity>
                    }
                  >
                    <CaptureTimerSelector value={captureTimerSeconds} onChange={(seconds) => {
                      setTimerOpen(false);
                      onSelectCaptureTimer(seconds);
                    }} />
                  </Popover>
                </Animated.View>
              );
            }

            if (controlId === "weather") {
              return (
                <View key={controlId}>
                  <Animated.View style={animatedStyle}>
                    <Popover
                      isVisible={open}
                      onRequestClose={() => setOpen(false)}
                      backgroundStyle={{ backgroundColor: "transparent" }}
                      popoverStyle={{ backgroundColor: "transparent" }}
                      from={
                        <TouchableOpacity
                          style={styles.controlButton}
                          onPress={control.onPress}
                          activeOpacity={0.72}
                        >
                          <Ionicons
                            name={control.icon}
                            size={26}
                            color={control.active ? "#ffaa00" : "white"}
                          />
                        </TouchableOpacity>
                      }
                    >
                      <PhotoWeather data={data} place={place} />
                    </Popover>
                  </Animated.View>
                </View>
              );
            }

            if (controlId === "projects") {
              return (
                <View
                  key={controlId}
                  style={[
                    styles.controlButton,
                    control.active && styles.controlButtonActive,
                  ]}
                >
                  <Animated.View style={animatedStyle}>
                    <ProjectSelector
                      projects={projects}
                      activeProjectId={activeProjectId}
                      onChangeProject={onChangeProject}
                      onCreateProject={onCreateProject}
                      includeNoneOption
                      noneOptionLabel="Nenhum projeto"
                      compact
                      bare
                      triggerActive={Boolean(activeProjectId)}
                      triggerIconSize={26}
                    />
                  </Animated.View>
                </View>
              );
            }

            if (controlId === "stacking") {
              return (
                <View key={controlId}>
                  <Animated.View style={animatedStyle}>
                    <Popover
                      isVisible={stackingOpen}
                      onRequestClose={() => setStackingOpen(false)}
                      backgroundStyle={{ backgroundColor: "transparent" }}
                      popoverStyle={{ backgroundColor: "transparent" }}
                      from={
                        <TouchableOpacity
                          style={[
                            styles.controlButton,
                            control.active && styles.controlButtonActive,
                          ]}
                          onPress={() => {
                            if (disabled) {
                              Alert.alert(
                                "Recurso indisponível",
                                unavailableReason ||
                                  "Os controles ficam bloqueados durante a captura.",
                              );
                              return;
                            }
                            setStackingOpen(true);
                          }}
                          activeOpacity={0.72}
                          accessibilityState={{ disabled }}
                        >
                          <Ionicons
                            name={control.icon}
                            size={26}
                            color={iconColor}
                          />
                        </TouchableOpacity>
                      }
                    >
                      <ImageStackingSelector
                        value={imageStackingStrategyId}
                        supportedStrategies={imageStackingSupportedStrategies}
                        disabled={disabled}
                        onChange={(strategyId) => {
                          setStackingOpen(false);
                          onSelectImageStackingStrategy(strategyId);
                        }}
                      />
                    </Popover>
                  </Animated.View>
                </View>
              );
            }

            if (controlId === "vertical") {
              return (
                <View key={controlId}>
                  <Animated.View style={animatedStyle}>
                    <Popover
                      isVisible={aspectRatioOpen}
                      onRequestClose={() => setAspectRatioOpen(false)}
                      backgroundStyle={{ backgroundColor: "transparent" }}
                      popoverStyle={{ backgroundColor: "transparent" }}
                      from={
                        <TouchableOpacity
                          style={[
                            styles.controlButton,
                            control.active && styles.controlButtonActive,
                          ]}
                          onPress={() => setAspectRatioOpen(true)}
                          activeOpacity={0.72}
                          accessibilityRole="button"
                          accessibilityLabel={`Proporção ${aspectRatio}`}
                        >
                          <Text
                            style={[
                              styles.aspectRatioLabel,
                              control.active && styles.aspectRatioLabelActive,
                            ]}
                          >
                            {aspectRatio}
                          </Text>
                        </TouchableOpacity>
                      }
                    >
                      <AspectRatioSelector
                        value={aspectRatio}
                        disabled={disabled}
                        onChange={(nextAspectRatio) => {
                          setAspectRatioOpen(false);
                          onSelectAspectRatio(nextAspectRatio);
                        }}
                      />
                    </Popover>
                  </Animated.View>
                </View>
              );
            }

            if (controlId === "rawCapture") {
              return (
                <Animated.View key={controlId} style={animatedStyle}>
                  <Popover
                    isVisible={formatOpen}
                    onRequestClose={() => setFormatOpen(false)}
                    backgroundStyle={{ backgroundColor: "transparent" }}
                    popoverStyle={{ backgroundColor: "transparent" }}
                    from={
                      <TouchableOpacity
                        style={[
                          styles.controlButton,
                          control.active && styles.controlButtonActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Formato de arquivo: ${control.label}`}
                        onPress={() => setFormatOpen(true)}
                      >
                        <View style={styles.rawControl}>
                          <Ionicons
                            name={control.icon}
                            size={26}
                            color={iconColor}
                          />
                          <Text
                            style={[
                              styles.rawLabel,
                              control.active && styles.rawLabelActive,
                            ]}
                          >
                            {control.label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    }
                  >
                    <FileFormatSelector
                      rawMode={rawMode}
                      processedEnabled={processedEnabled}
                      photoFormat={photoFormat}
                      rawAvailable={rawCaptureAvailable}
                      supportedRawModes={supportedRawModes}
                      heifPlusAvailable={heifPlusAvailable}
                      unavailableReason={unavailableReasons.rawCapture}
                      onToggle={onToggleFileFormat}
                      onSelectPhotoFormat={onSelectPhotoFormat}
                      onSelectRawMode={onSelectRawMode}
                    />
                  </Popover>
                </Animated.View>
              );
            }

            return (
              <TouchableOpacity
                key={controlId}
                style={[
                  styles.controlButton,
                  control.active && styles.controlButtonActive,
                ]}
                onPress={() => {
                  if (disabled) {
                    Alert.alert(
                      "Recurso indisponível",
                      unavailableReason ||
                        (controlsDisabled
                          ? "Os controles ficam bloqueados durante a captura."
                          : "Este recurso não é compatível com a lente atual."),
                    );
                    return;
                  }
                  control.onPress?.();
                }}
                activeOpacity={0.72}
                accessibilityState={{ disabled }}
              >
                <Animated.View
                  style={[animatedStyle, disabled && styles.disabledControl]}
                >
                  {control.symbol ? (
                    <SymbolView
                      name={control.symbol}
                      size={26}
                      type="monochrome"
                      tintColor={iconColor}
                      resizeMode="scaleAspectFit"
                      style={styles.symbolButton}
                      fallback={
                        <Ionicons
                          name={control.icon}
                          size={26}
                          style={styles.button}
                          color={iconColor}
                        />
                      }
                    />
                  ) : (
                    <Ionicons
                      name={control.icon}
                      size={26}
                      style={styles.button}
                      color={iconColor}
                    />
                  )}
                </Animated.View>
              </TouchableOpacity>
            );
          })
        )}
      </FadeAnimated.View>
      {noticeVisible && (
        <FadeAnimated.View
          style={[styles.notice, { opacity: notice.opacity }]}
          pointerEvents="none"
        >
          <Text style={styles.noticeText} numberOfLines={1} ellipsizeMode="tail">
            {notice.message}
          </Text>
        </FadeAnimated.View>
      )}
    </View>
  );
}
