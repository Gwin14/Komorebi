import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: 196,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(18,18,18,0.97)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  title: {
    color: "white",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  options: { gap: 6 },
  option: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  optionActive: {
    borderColor: "rgba(255,170,0,0.7)",
    backgroundColor: "rgba(255,170,0,0.12)",
  },
  frame: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.82)",
    borderRadius: 2,
  },
  frame43: { width: 17, height: 22, marginHorizontal: 2.5 },
  frame169: { width: 13, height: 22, marginHorizontal: 4.5 },
  frame11: { width: 18, height: 18, marginHorizontal: 2 },
  frameActive: { borderColor: "#ffaa00" },
  label: {
    color: "white",
    fontSize: 12,
    marginLeft: 10,
    fontVariant: ["tabular-nums"],
  },
  labelActive: { color: "#ffaa00", fontWeight: "700" },
});
