import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import styles from "./Galery.styles";

export default function PhotoRatingControls({ rating, disabled, onRate }) {
  return (
    <View style={[styles.ratingSection, disabled && styles.disabledAction]}>
      <Text style={styles.ratingLabel}>
        Classificação{rating != null ? ` · ${rating}/5` : ""}
      </Text>
      <View style={styles.ratingControls}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Remover classificação"
          accessibilityState={{ disabled, selected: rating === 0 }}
          disabled={disabled}
          onPress={() => onRate(0)}
          style={styles.ratingClear}
        >
          <MaterialCommunityIcons name="star-off-outline" size={23} color={rating === 0 ? "#ffaa00" : "#aaa"} />
        </TouchableOpacity>
        {[1, 2, 3, 4, 5].map((value) => (
          <TouchableOpacity
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Classificar com ${value} estrelas`}
            accessibilityState={{ disabled, selected: rating === value }}
            disabled={disabled}
            onPress={() => onRate(value)}
            style={styles.ratingStar}
          >
            <Ionicons name={(rating ?? 0) >= value ? "star" : "star-outline"} size={23} color={(rating ?? 0) >= value ? "#ffaa00" : "#747474"} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
