import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState , useEffect,  } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Popover from "react-native-popover-view";
import Animated from "react-native-reanimated";
import useDeviceOrientation from "../hooks/useDeviceOrientation";
import PhotoWeather from "./PhotoWeather";
import * as Location from "expo-location"

export default function TopBar({
  flash,
  toggleFlash,
  toggleMode,
  activeControl,
  selectedLutId,
}) {
  const router = useRouter();
  const animatedStyle = useDeviceOrientation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [place, setPlace] = useState(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
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
  }, []);

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

  return (
    <View style={styles.buttonsContainer}>
      <TouchableOpacity onPress={toggleFlash}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name={flash === "off" ? "flash-off-outline" : "flash-outline"}
            size={32}
            style={styles.button}
            color="white"
          />
        </Animated.View>
      </TouchableOpacity>

      {/* <TouchableOpacity onPress={() => toggleMode("zoom")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="aperture-outline"
            size={32}
            style={styles.button}
            color={activeControl === "zoom" ? "#ffaa00" : "white"}
          />
        </Animated.View>
      </TouchableOpacity> */}

      <TouchableOpacity>
        <Animated.View style={animatedStyle}>
          <Popover
            isVisible={open}
            onRequestClose={() => setOpen(false)}
            backgroundStyle={{ backgroundColor: "transparent" }}
            popoverStyle={{ backgroundColor: "transparent" }}
            from={
              <TouchableOpacity onPress={() => setOpen(true)}>
                <Ionicons name="cloud-outline" size={32} color="white" />
              </TouchableOpacity>
            }
          >
            <PhotoWeather data={data} place={place} />
          </Popover>
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => toggleMode("lut")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="color-filter-outline"
            size={32}
            style={styles.button}
            color={
              activeControl === "lut"
                ? "#ffaa00"
                : selectedLutId !== "none"
                  ? "#ffaa00"
                  : "white"
            }
          />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("components/Settings")}>
        <Animated.View style={animatedStyle}>
          <Ionicons
            name="settings-outline"
            size={32}
            color="white"
            style={styles.button}
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonsContainer: {
    position: "absolute",
    top: 64,
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    zIndex: 10,
  },
  button: {},
});
