import { Text, View } from "react-native";
import FocusFrameCountDial from "./FocusFrameCountDial";
import FocusRangeSlider from "./FocusRangeSlider";
import styles from "./FocusBracketingPanel.styles";

export default function FocusBracketingPanel({ focus, disabled, topBarBelow }) {
  return (
    <View>
      <View style={styles.container}>
        <FocusFrameCountDial value={focus.config.frameCount} onChange={focus.setFrameCount}
          disabled={disabled} topBarBelow={topBarBelow} />
        <View style={styles.slider}>
          <FocusRangeSlider limits={focus.limits} activeEndpoint={focus.activeEndpoint}
            onChange={focus.adjustEndpoint} disabled={disabled} topBarBelow={topBarBelow} />
        </View>
      </View>
      {focus.error && (
        <Text style={styles.message} accessibilityLiveRegion="polite">{focus.error}</Text>
      )}
    </View>
  );
}
