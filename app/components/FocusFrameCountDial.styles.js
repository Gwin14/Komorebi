import { StyleSheet } from "react-native";
export default StyleSheet.create({
  container: { width: 108, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, color: "#aaa" },
  titleBelow: { marginTop: 8, marginBottom: 0 },
  dial: { width: "100%", height: 40, overflow: "hidden", borderRadius: 8, backgroundColor: "transparent" },
  selection: { position: "absolute", top: 0, bottom: 0, left: "50%", marginLeft: -17, width: 34, backgroundColor: "rgba(255,170,0,0.07)" },
  needle: { position: "absolute", left: "50%", marginLeft: -1, top: 0, height: 6, width: 2, backgroundColor: "#ffaa00" },
  numberSlot: { position: "absolute", top: 9, width: 34, alignItems: "center", gap: 5 },
  tick: { width: 1, height: 6, backgroundColor: "#999" },
  selectedTick: { backgroundColor: "#ffaa00" },
  number: { color: "#ddd", fontSize: 12, fontVariant: ["tabular-nums"] },
  selectedNumber: { color: "#ffaa00", fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
