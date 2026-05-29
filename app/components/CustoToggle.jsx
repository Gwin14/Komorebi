import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  Text,
  View
} from "react-native";
import styles from "./CustoToggle.styles";

export default function CustomToggle({ label, value, onValueChange }) {
  // Animação para mover a "bolinha" do toggle
  const moveAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(moveAnim, {
      toValue: value ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 50,
    }).start();
  }, [value]);

  const toggleHandler = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(!value);
  };

  const translateX = moveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 26], // Ajuste baseado no tamanho do container
  });

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable onPress={toggleHandler}>
        <View style={[styles.track, value && styles.trackActive]}>
          <Animated.View
            style={[
              styles.thumb,
              { transform: [{ translateX }] },
              value && styles.thumbActive,
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

