import { StyleSheet } from "react-native";

export default StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  statusContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  statusPill: {
    minHeight: 34,
    maxWidth: "100%",
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,15,2,0.84)",
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,170,0,0.9)",
  },
  statusText: { color: "#FFD36A", fontSize: 12, fontWeight: "600", lineHeight: 16, textAlign: "center" },
  liquidLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  liquidWave: {
    position: "absolute",
    left: "-10%",
    width: "120%",
    height: 170,
    overflow: "hidden",
  },
  liquidMask: {
    ...StyleSheet.absoluteFillObject,
  },
  liquidRefraction: {
    height: 170,
  },
  liquidBackdrop: {
    position: "absolute",
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
