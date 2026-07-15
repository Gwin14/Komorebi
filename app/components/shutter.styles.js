import { StyleSheet } from "react-native";

export default StyleSheet.create({
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "#ffaa00ff",
    backgroundColor: "#000000", // botão escuro para destacar o neon
    shadowColor: "#ffaa00ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 15, // Android
    alignSelf: "center",
    marginHorizontal: 20,
  },
  compactShutter: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    marginHorizontal: 0,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
    transform: [{ translateX: -35 }, { translateY: 0 }],
  },
});
