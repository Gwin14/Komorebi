import { StyleSheet } from "react-native";

export default StyleSheet.create({
  controlRow: { padding: 14 },
  resetButton: { padding: 16 },
  advancedButton: { justifyContent: "space-between" },
  note: { padding: 14 },
  disabled: { opacity: 0.35 },
  slider: {
    height: 52,
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#191919",
    borderRadius: 14,
    marginTop: 8,
  },
  sliderScale: { height: 32, justifyContent: "center" },
  sliderRail: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#444",
    position: "absolute",
    left: 0,
    right: 0,
  },
  sliderTicks: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sliderTick: { width: 2, height: 8, borderRadius: 1, backgroundColor: "#555" },
  sliderMajorTick: { height: 16, backgroundColor: "#888" },
  sliderIndicator: {
    position: "absolute",
    width: 10,
    height: 28,
    marginLeft: -5,
    backgroundColor: "#ffaa00",
    borderRadius: 5,
  },
  actions: { flexDirection: "row", gap: 20, paddingTop: 12 },
});
