import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  valueText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  dialContainer: {
    height: 36,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  ruleTrack: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  tick: {
    width: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 1,
  },
  minorTick: {
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  majorTick: {
    height: 18,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    width: 2,
  },
  centerTick: {
    backgroundColor: "#FFD700",
    height: 20,
  },
  centerIndicator: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    width: 2,
    height: 26,
    backgroundColor: "#ffaa00",
    borderRadius: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
  },
});
