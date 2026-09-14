import { StyleSheet } from "react-native";

export default StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  liquidLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  liquidWave: {
    position: "absolute",
    left: "-10%",
    width: "120%",
    height: 94,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.42)",
    shadowColor: "white",
    shadowOpacity: 0.22,
    shadowRadius: 7,
  },
  liquidRefraction: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  liquidHighlight: {
    position: "absolute",
    left: "9%",
    right: "9%",
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  button: {
    position: "absolute", right: 10, bottom: 10,
    zIndex: 10, elevation: 10,
    minWidth: 58, height: 44, paddingHorizontal: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.5)",
  },
  disabled: { opacity: 0.45 },
  label: { color: "white", fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
});
