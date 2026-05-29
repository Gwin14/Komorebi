import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: { height: 100, alignItems: "center", justifyContent: "center" },
  dialContainer: {
    height: 80,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  line: { position: "absolute", width: 2, borderRadius: 1 },
  pointer: {
    position: "absolute",
    width: 2,
    height: 60,
    backgroundColor: "#ffaa00",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
});
