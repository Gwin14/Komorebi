import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  title: { color: "white", fontWeight: "600", fontSize: 12 },
  detail: { color: "#ffaa00", fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  cancelButton: { paddingHorizontal: 8, paddingVertical: 4 },
  cancelText: { color: "#ddd", fontSize: 22, lineHeight: 24 },
});
