import { StyleSheet } from "react-native";

export default StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 48,
  },
  iconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 170, 0, 0.09)",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    marginRight: 9,
    width: 34,
  },
  copy: {
    flex: 1,
  },
  label: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  value: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
