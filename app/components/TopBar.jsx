import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";
import Animated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import PhotoWeather from "./PhotoWeather";
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
  verticalMode,
  toggleVerticalMode,
  topBarControls = [],
  firstTime,
  manualControlsAvailable,
  manualMode,
  rawCaptureAvailable,
  rawMode,
  toggleRawMode,
  livePhotoAvailable,
  livePhotoEnabled,
  toggleLivePhotoEnabled,
  portraitCaptureAvailable,
  portraitModeEnabled,
  togglePortraitModeEnabled,
}) {
  const router = useRouter();
  const animatedStyle = useDeviceOrientation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [place, setPlace] = useState(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (firstTime) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Permissão de localização negada");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setCoords({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
      });

      console.log("Coords obtidas:", coords);
    })();
  }, [firstTime]);

  useEffect(() => {
    if (!coords) return;

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,cloud_cover,wind_speed_10m,precipitation&daily=sunrise,sunset&timezone=auto`,
    )
      .then((res) => res.json())
      .then(setData)
      .catch(console.error);
  }, [coords]);

  useEffect(() => {
    if (!coords) return;

    fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=pt`,
    )
      .then((res) => res.json())
      .then((json) => {
        setPlace({
          city: json.city || json.locality || "Localização desconhecida",
          region: json.principalSubdivision || "",
          country: json.countryName || "",
        });
      })
      .catch(console.error);
  }, [coords]);

  const controlOptions = {
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
      icon: verticalMode
        ? "phone-portrait-outline"
        : "tablet-landscape-outline",
      onPress: toggleVerticalMode,
      active: verticalMode,
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
        rawMode === "proRaw" ? "PRO" : rawMode === "raw" ? "RAW" : "OFF",
      onPress: toggleRawMode,
      active: rawMode !== "off",
    },
    livePhoto: {
      icon: livePhotoEnabled ? "radio-button-on" : "radio-button-on-outline",
      onPress: toggleLivePhotoEnabled,
      active: livePhotoEnabled,
    },
    portrait: {
      icon: portraitModeEnabled ? "person" : "person-outline",
      onPress: togglePortraitModeEnabled,
      active: portraitModeEnabled,
    },
  };

  return (
    <View style={styles.buttonsContainer}>
      {topBarControls.map((controlId) => {
        if (controlId === "manual" && !manualControlsAvailable) return null;
        if (controlId === "rawCapture" && !rawCaptureAvailable) return null;
        if (controlId === "livePhoto" && !livePhotoAvailable) return null;
        if (controlId === "portrait" && !portraitCaptureAvailable) return null;

        const control = controlOptions[controlId];
        if (!control) return null;

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
                    <TouchableOpacity onPress={control.onPress}>
                      <Ionicons
                        name={control.icon}
                        size={32}
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

        return (
          <TouchableOpacity key={controlId} onPress={control.onPress}>
            <Animated.View style={animatedStyle}>
              {controlId === "rawCapture" ? (
                <View style={styles.rawControl}>
                  <Ionicons
                    name={control.icon}
                    size={28}
                    color={control.active ? "#ffaa00" : "white"}
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
              ) : (
                <Ionicons
                  name={control.icon}
                  size={32}
                  style={styles.button}
                  color={control.active ? "#ffaa00" : "white"}
                />
              )}
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
