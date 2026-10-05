import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import ExposureSlider from "./ExposureSlider";
import styles from "./PortraitAdjustmentSlider.styles";

function PortraitControls({ portrait, exposure, setExposure, topBarBelow }) {
  const [adjustingPortrait, setAdjustingPortrait] = useState(false);
  const { width } = useWindowDimensions();

  return (
    <View style={styles.row}>
      <ExposureSlider
        key={adjustingPortrait ? "portrait" : "ev"}
        exposure={adjustingPortrait ? portrait.aperture : exposure}
        setExposure={adjustingPortrait ? portrait.setAperture : setExposure}
        minExposure={adjustingPortrait ? 1.4 : -2}
        maxExposure={adjustingPortrait ? 16 : 2}
        resetValue={adjustingPortrait ? 4.5 : 0}
        formatLabel={adjustingPortrait ? (value) => `f/${value.toFixed(1)}` : undefined}
        topBarBelow={topBarBelow}
        dialWidth={Math.min(width * 0.6, width - 88)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={adjustingPortrait ? "Ajustar exposição EV" : "Ajustar abertura do retrato"}
        accessibilityHint="Alterna a régua entre exposição e desfoque do retrato"
        onPress={() => setAdjustingPortrait((current) => !current)}
        style={({ pressed }) => [
          styles.button,
          { marginTop: topBarBelow ? -22 : 22 },
          adjustingPortrait && styles.selected,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={adjustingPortrait ? "sunny-outline" : "aperture-outline"}
          size={22}
          color="white"
        />
      </Pressable>
    </View>
  );
}

export default function PortraitAdjustmentSlider(props) {
  if (!props.portrait.enabled) {
    return <ExposureSlider exposure={props.exposure} setExposure={props.setExposure} topBarBelow={props.topBarBelow} />;
  }
  return <PortraitControls {...props} />;
}
