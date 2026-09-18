import { StyleSheet } from "react-native";

export default StyleSheet.create({
  buttonsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  popoverTransparent: {
    backgroundColor: "transparent",
  },
  controlButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,8,8,0.28)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  controlButtonActive: {
    borderColor: "rgba(255,170,0,0.48)",
    backgroundColor: "rgba(255,170,0,0.11)",
    shadowColor: "#ffaa00",
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  button: {
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  symbolButton: {
    width: 26,
    height: 26,
  },
  disabledControl: {
    opacity: 0.35,
  },
  rawControl: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 30,
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
