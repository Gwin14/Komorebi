import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Button,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSettings } from "../context/SettingsContext";

export default function Welcome() {
  // const [modalVisible, setModalVisible] = useState(true);
  const rotation = useRef(new Animated.Value(0)).current;
  const { setFirstTime } = useSettings();

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: 1,
      duration: 3000, // duração total
      easing: Easing.out(Easing.cubic), // desacelera no final 😮‍🔥
      useNativeDriver: true,
    }).start();
  }, []);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["-90deg", "90deg"], // gira só um pouco
  });

  return (
    <Modal
      animationType="slide"
      // visible={modalVisible}
      presentationStyle="pageSheet"
      onRequestClose={() =>  setFirstTime(false)}
    >
      <View style={styles.container}>
        {/* Fundo animado */}
        <Animated.View
          style={[
            styles.gradientWrapper,
            { transform: [{ rotate: rotateInterpolate }] },
          ]}
        >
          <LinearGradient
            colors={["#ff8a00", "#000000", "#ff8a00"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
        </Animated.View>

        {/* Conteúdo */}
        <View style={styles.content}>
          <Image
            source={require("../../assets/images/icone.png")}
            style={styles.image}
          />

          <Text style={styles.title}>Bem vindo(a)!</Text>

          <Text style={styles.text}>
            Desejo uma ótima experiência de uso no meu app, ainda há muitas
            coisas para serem feitas.
          </Text>

          <Text style={styles.text}>Divirta-se e agradeço o feedback!</Text>

          <Button
            title="Começar a fotografar"
            onPress={() => setFirstTime(false)}
            color="#ffaa00"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },

  gradientWrapper: {
    position: "absolute",
    height: 2000,
    width: 2000,
    top: "-80%",
    left: "-80%",
  },

  gradient: {
    height: 3000,
    width: 3000,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  image: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },

  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },

  text: {
    color: "#fff",
    textAlign: "center",
    marginVertical: 10,
    fontSize: 16,
  },
});
