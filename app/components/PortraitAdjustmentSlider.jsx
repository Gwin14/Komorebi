import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import ExposureSlider from "./ExposureSlider";
import styles from "./PortraitAdjustmentSlider.styles";
import exposureStyles from "./ExposureSlider.styles";
import topBarStyles from "./TopBar.styles";

function PortraitControls({ portrait, exposure, setExposure, topBarBelow }) {
  const [adjustingPortrait, setAdjustingPortrait] = useState(false);
  const { width } = useWindowDimensions();
  const sliderWidth = Math.max(80, Math.min(width * 0.6, width - 104));

  return (
    <View style={styles.row}>
      <View style={[exposureStyles.container, topBarBelow && { marginVertical: -5 }]}>
        {!topBarBelow && (
          <Text accessible={false} style={[exposureStyles.exposureText, styles.labelSpacer]}>EV</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={adjustingPortrait ? "Ajustar exposição EV" : "Ajustar abertura do retrato"}
          accessibilityHint="Alterna a régua entre exposição e desfoque do retrato"
          onPress={() => setAdjustingPortrait((current) => !current)}
          style={({ pressed }) => [
            topBarStyles.controlButton,
            styles.button,
            adjustingPortrait && topBarStyles.controlButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={adjustingPortrait ? "aperture-outline" : "sunny-outline"}
            size={20}
            color={adjustingPortrait ? "#ffaa00" : "white"}
          />
        </Pressable>
        {topBarBelow && (
          <Text accessible={false} style={[exposureStyles.exposureText, exposureStyles.exposureTextBelow, styles.labelSpacer]}>EV</Text>
        )}
      </View>
      <ExposureSlider
        key={adjustingPortrait ? "portrait" : "ev"}
        exposure={adjustingPortrait ? portrait.aperture : exposure}
        setExposure={adjustingPortrait ? portrait.setAperture : setExposure}
        minExposure={adjustingPortrait ? 1.4 : -2}
        maxExposure={adjustingPortrait ? 16 : 2}
        resetValue={adjustingPortrait ? 4.5 : 0}
        formatLabel={adjustingPortrait ? (value) => `f/${value.toFixed(1)}` : undefined}
        topBarBelow={topBarBelow}
        dialWidth={sliderWidth}
      />
    </View>
  );
}

export default function PortraitAdjustmentSlider(props) {
  if (!props.portrait.enabled) {
    return <ExposureSlider exposure={props.exposure} setExposure={props.setExposure} topBarBelow={props.topBarBelow} />;
  }
  return <PortraitControls {...props} />;
}
