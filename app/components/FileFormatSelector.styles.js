import { StyleSheet } from "react-native";
export default StyleSheet.create({
  container: { width: 280, padding: 14, borderRadius: 14, backgroundColor: "rgba(18,18,18,0.97)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", gap: 10 },
  title: { color: "white", fontSize: 14, fontWeight: "700", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  selected: { borderColor: "#ffaa00", backgroundColor: "rgba(255,170,0,0.12)" },
  label: { color: "white", fontSize: 12 },
  options: { flexDirection: "row", gap: 6 },
  option: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  description: { color: "#bbb", fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.45 },
});
