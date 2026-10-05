import { StyleSheet } from "react-native";

export default StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  selected: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  pressed: {
    opacity: 0.6,
  },
});
