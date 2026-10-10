import { StyleSheet } from "react-native";

export default StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#252525",
    borderRadius: 14,
    padding: 10,
    marginBottom: 26,
    gap: 12,
  },
  cardPressed: { backgroundColor: "#1a1a1a" },
  image: { width: 76, height: 100, borderRadius: 8, backgroundColor: "#222" },
  content: { flex: 1, minWidth: 0, justifyContent: "center" },
  title: { color: "#f4f4f4", fontSize: 15, fontWeight: "600", lineHeight: 20 },
  description: { color: "#858585", fontSize: 12, lineHeight: 17, marginTop: 6 },
  chevron: { marginLeft: -4 },
});
