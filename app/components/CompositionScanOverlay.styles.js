import { StyleSheet } from "react-native";

export default StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  button: {
    position: "absolute", right: 10, bottom: 10,
    minWidth: 58, height: 44, paddingHorizontal: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.5)",
  },
  disabled: { opacity: 0.45 },
  label: { color: "white", fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
});
