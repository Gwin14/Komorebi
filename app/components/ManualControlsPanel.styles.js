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
  slider: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  labelSpacer: {
    opacity: 0,
  },
});
