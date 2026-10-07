import { Text, View } from "react-native";
import BackButton from "./BackButton";
import styles from "./ScreenHeader.styles";

export default function ScreenHeader({ title, onBack, right }) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        <BackButton inline onPress={onBack} />
      </View>
      <Text numberOfLines={1} accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.side}>{right}</View>
    </View>
  );
}
