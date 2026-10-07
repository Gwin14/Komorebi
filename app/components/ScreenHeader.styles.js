import { StyleSheet } from "react-native";

export default StyleSheet.create({
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#242424",
    backgroundColor: "#000",
  },
  side: { width: 52, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
});
