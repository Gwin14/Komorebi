import { StyleSheet } from "react-native";

export const ROW_HEIGHT = 64;

export default StyleSheet.create({
  list: {
    backgroundColor: "#111",
    borderColor: "#252525",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    backgroundColor: "#111",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#252525",
  },
  lastRow: { borderBottomWidth: 0 },
  activeRow: { zIndex: 10, backgroundColor: "#242016", elevation: 6 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    marginRight: 12,
  },
  text: { flex: 1, paddingVertical: 8 },
  label: { color: "#f4f4f4", fontSize: 14, fontWeight: "600" },
  subtitle: { color: "#858585", fontSize: 12, marginTop: 3 },
  handle: {
    width: 48,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    width: 36,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
