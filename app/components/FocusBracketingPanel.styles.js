import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingHorizontal: 24,
    paddingVertical: 2,
  },
  slider: { flex: 1 },
  message: {
    color: "#aaa",
    fontSize: 10,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
