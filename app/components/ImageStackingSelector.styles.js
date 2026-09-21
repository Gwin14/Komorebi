import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    color: "white",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  options: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  option: {
    flex: 1,
    maxWidth: 100,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
    fontSize: 10,
    marginTop: 5,
    textAlign: "center",
  },
  labelActive: {
    color: "#ffaa00",
    fontWeight: "700",
  },
});
