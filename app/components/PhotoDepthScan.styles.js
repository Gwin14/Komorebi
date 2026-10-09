import { StyleSheet } from "react-native";

export default StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  mask: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#080808" },
  fallbackMask: { backgroundColor: "rgba(80,140,170,0.28)" },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,170,0,0.12)" },
  beam: { position: "absolute", top: -24, left: 0, right: 0, height: 48 },
  glow: { ...StyleSheet.absoluteFillObject },
  line: {
    position: "absolute",
    top: 23,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#ffe3a3",
    shadowColor: "#ffaa00",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
