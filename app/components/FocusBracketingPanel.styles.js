import { StyleSheet } from "react-native";
export default StyleSheet.create({
  container: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: "#111", gap: 3 },
  hint: { color: "#bbb", fontSize: 10, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  text: { color: "white", fontSize: 11 },
  button: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#333", borderRadius: 7 },
  disabled: { opacity: 0.4 },
  limit: { color: "#ffaa00", fontSize: 10, paddingVertical: 7 },
  step: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#333", borderRadius: 7 },
  message: { color: "#ccc", fontSize: 10, textAlign: "center" },
});
