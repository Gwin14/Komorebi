import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: "100%",
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    width: "100%",
    maxHeight: 34,
  },
  scrollContent: {
    flexGrow: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  button: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderBottomWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInactive: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
  },
  buttonActive: {
    backgroundColor: "rgba(255,170,0,0.06)",
    borderBottomColor: "#ffaa00",
  },
  label: {
    color: "#f5f5f5",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
  labelActive: {
    color: "#ffaa00",
    fontWeight: "800",
  },
});
