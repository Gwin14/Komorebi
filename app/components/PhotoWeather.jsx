import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Text, View } from "react-native";
import styles from "./PhotoWeather.styles";

const formatNumber = (value, maximumFractionDigits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits,
  }).format(number);
};

const formatTime = (value) => {
  if (!value) return "—";

  const match = String(value).match(/T(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const WeatherRow = ({ icon, label, value }) => (
  <View style={styles.row}>
    <View style={styles.rowLabelContainer}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.68)" />
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

export default function PhotoWeather({ data, place }) {
  const current = data?.current;
  const daily = data?.daily;
  const location = place
    ? [place.city, place.region, place.country].filter(Boolean).join(", ")
    : null;
  const isLoading = !current || !daily || !location;

  return (
    <BlurView intensity={30} tint="dark" style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TEMPO</Text>
        <Text style={styles.liveLabel}>AGORA</Text>
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Carregando informações…</Text>
      ) : (
        <>
          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={14}
              color="rgba(255,255,255,0.68)"
            />
            <Text numberOfLines={2} style={styles.locationText}>
              {location}
            </Text>
          </View>

          <View style={styles.divider} />

          <WeatherRow
            icon="thermometer-outline"
            label="Temperatura"
            value={`${formatNumber(current.temperature_2m)} °C`}
          />
          <WeatherRow
            icon="cloud-outline"
            label="Nuvens"
            value={`${formatNumber(current.cloud_cover, 0)}%`}
          />
          <WeatherRow
            icon="speedometer-outline"
            label="Vento"
            value={`${formatNumber(current.wind_speed_10m)} km/h`}
          />
          <WeatherRow
            icon="rainy-outline"
            label="Chuva"
            value={`${formatNumber(current.precipitation)} mm`}
          />

          <View style={styles.divider} />

          <WeatherRow
            icon="sunny-outline"
            label="Nascer do sol"
            value={formatTime(daily.sunrise?.[0])}
          />
          <WeatherRow
            icon="moon-outline"
            label="Pôr do sol"
            value={formatTime(daily.sunset?.[0])}
          />
        </>
      )}
    </BlurView>
  );
}
