import { Ionicons } from "@expo/vector-icons";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import styles from "./FileFormatSelector.styles";

export default function FileFormatSelector({
  rawMode,
  processedEnabled,
  photoFormat,
  rawAvailable,
  supportedRawModes,
  heifPlusAvailable,
  unavailableReason,
  onToggle,
  onSelectPhotoFormat,
  onSelectRawMode,
}) {
  const rawEnabled = rawMode !== "off";
  const row = (label, selected, disabled, onPress) => (
    <TouchableOpacity
      style={[
        styles.row,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <Ionicons
        name={selected ? "checkbox" : "square-outline"}
        size={22}
        color={selected ? "#ffaa00" : "white"}
      />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Formato de arquivo</Text>
      {row("RAW", rawEnabled, !rawAvailable, () => onToggle("raw"))}
      {rawAvailable &&
        supportedRawModes.includes("proRaw") &&
        supportedRawModes.includes("raw") && (
          <View style={styles.options}>
            {[
              ["proRaw", "ProRAW"],
              ["raw", "RAW Bayer"],
            ].map(([mode, label]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.option, rawMode === mode && styles.selected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: rawMode === mode }}
                onPress={() => onSelectRawMode(mode)}
              >
                <Text style={styles.label}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      {row(
        "Foto processada",
        processedEnabled,
        !rawAvailable && !rawEnabled,
        () => onToggle("processed"),
      )}
      <View style={styles.options}>
        {(Platform.OS === "ios"
          ? [
              ["heif", "HEIF"],
              ...(heifPlusAvailable ? [["heifPlus", "HEIF+"]] : []),
              ["jpeg", "JPEG"],
            ]
          : [["jpeg", "JPEG"]]
        ).map(([format, label]) => (
          <TouchableOpacity
            key={format}
            style={[styles.option, photoFormat === format && styles.selected]}
            accessibilityRole="radio"
            accessibilityState={{
              selected: photoFormat === format && processedEnabled,
            }}
            onPress={() => {
              if (!processedEnabled) onToggle("processed");
              onSelectPhotoFormat(format);
            }}
          >
            <Text style={styles.label}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.description}>
        {rawEnabled && processedEnabled
          ? photoFormat === "jpeg"
            ? "DNG + JPEG em uma única foto no Fotos."
            : "DNG + HEIC em uma única foto no Fotos. HEIF+ preserva a revelação personalizada."
          : "Ao desativar o último formato, o outro é ativado automaticamente."}
      </Text>
      {!rawAvailable && (
        <Text style={styles.description}>{unavailableReason}</Text>
      )}
    </View>
  );
}
