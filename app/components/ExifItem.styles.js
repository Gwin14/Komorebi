import { StyleSheet } from "react-native";

export default StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 38,
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: 10,
    height: 24,
    justifyContent: "center",
    marginRight: 9,
    width: 20,
  },
  copy: {
    flex: 1,
  },
  label: {
    color: "#a3a3a3",
    fontSize: 10,
    fontWeight: "400",
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  value: {
    color: "#e4e4e4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
});
