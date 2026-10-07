import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: 180,
    padding: 12,
    gap: 6,
    borderRadius: 14,
    backgroundColor: "rgba(18,18,18,0.97)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  title: { color: "white", textAlign: "center", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  option: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  optionActive: { borderColor: "rgba(255,170,0,0.7)", backgroundColor: "rgba(255,170,0,0.12)" },
  label: { color: "white", fontSize: 13 },
  labelActive: { color: "#ffaa00", fontWeight: "700" },
});
