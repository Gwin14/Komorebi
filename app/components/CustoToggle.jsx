import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import styles from "./CustoToggle.styles";

export default function CustomToggle({
  badge,
  description,
  label,
  value,
  onValueChange,
}) {
  // Animação para mover a "bolinha" do toggle
  const moveAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(moveAnim, {
      toValue: value ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 50,
    }).start();
  }, [moveAnim, value]);

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
      {label && (
        <View style={styles.labelBlock}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            {badge && <Text style={styles.badge}>{badge}</Text>}
          </View>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
        </View>
      )}

      <Pressable
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onPress={toggleHandler}
      >
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
