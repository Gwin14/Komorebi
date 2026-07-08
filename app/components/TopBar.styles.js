import { StyleSheet } from "react-native";

export default StyleSheet.create({
  buttonsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
  },
  button: {},
  symbolButton: {
    width: 32,
    height: 32,
  },
  disabledControl: {
    opacity: 0.35,
  },
  rawControl: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
  },
  rawLabel: {
    color: "white",
    fontSize: 8,
    fontWeight: "700",
    marginTop: -2,
    letterSpacing: 0,
  },
  rawLabelActive: {
    color: "#ffaa00",
  },
});
