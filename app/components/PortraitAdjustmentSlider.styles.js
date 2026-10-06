import { StyleSheet } from "react-native";

export default StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",

  },
  labelSpacer: {
    opacity: 0,
  },
  pressed: {
    opacity: 0.6,
  },
});
