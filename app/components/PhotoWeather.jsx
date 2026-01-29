import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { StyleSheet, Text, View } from "react-native";

export default function PhotoWeather({ data, place }) {
  if (!data || !place) {
    return (
      <BlurView intensity={80} tint="light" style={styles.container}>
        <View style={styles.container}>
          <Text style={styles.text}>Carregando informações…</Text>
        </View>
      </BlurView>
    );
  }

  const { current, daily } = data;

  return (
    <BlurView intensity={80} tint="light" style={styles.container}>
      {place ? (
        <View style={styles.row}>
          <Ionicons name="location-outline" size={18} color="white" />
          <Text style={styles.text}>
            {place.city}, {place.region} — {place.country}
          </Text>
        </View>
      ) : (
        <Text style={styles.text}>📍 Obtendo localização…</Text>
      )}

      <View style={styles.divider} />

      {/* <View style={styles.row}>
        <Ionicons name="camera-outline" size={18} color="white" />
        <Text style={styles.text}>Condições agora</Text>
      </View> */}
      <View style={styles.row}>
        <Ionicons name="thermometer-outline" size={18} color="white" />
        <Text style={styles.text}>Temp: {current.temperature_2m}°C</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="cloud-outline" size={18} color="white" />
        <Text style={styles.text}>Nuvens: {current.cloud_cover}%</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="speedometer-outline" size={18} color="white" />
        <Text style={styles.text}>Vento: {current.wind_speed_10m} km/h</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="rainy-outline" size={18} color="white" />
        <Text style={styles.text}>Chuva: {current.precipitation} mm</Text>
      </View>

      <View style={styles.divider} />

      {/* <View style={styles.row}>
        <Ionicons name="sunny-outline" size={18} color="white" />
        <Text style={styles.text}>Clima diário</Text>
      </View> */}
      {/* <View style={styles.row}>
        <Ionicons name="sunny-outline" size={18} color="white" />
        <Text style={styles.text}>Sol</Text>
      </View> */}
      <View style={styles.row}>
        <Ionicons name="sunny-outline" size={18} color="white" />
        <Text style={styles.text}>Nascer: {daily.sunrise[0]}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="moon-outline" size={18} color="white" />
        <Text style={styles.text}>Pôr: {daily.sunset[0]}</Text>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    alignSelf: "flex-start",
    overflow: "hidden",
    padding: 12,
    backgroundColor: "#00000087",
  },
  text: {
    color: "white",
    marginBottom: 4,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8e8e87b",
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
