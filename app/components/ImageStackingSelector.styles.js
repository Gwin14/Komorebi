import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: 216,
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
  options: {
    gap: 6,
  },
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
  label: {
    color: "white",
    fontSize: 12,
    marginLeft: 10,
  },
  labelActive: {
    color: "#ffaa00",
    fontWeight: "700",
  },
});
