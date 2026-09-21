import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 14,
    zIndex: 50,
  },
  card: {
    minWidth: 156,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,170,0,0.42)",
    alignItems: "center",
  },
  title: { color: "white", fontWeight: "700", fontSize: 12 },
  detail: { color: "#ffaa00", fontVariant: ["tabular-nums"], marginTop: 3 },
  track: {
    width: 124,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    marginTop: 7,
  },
  fill: { height: "100%", backgroundColor: "#ffaa00" },
  cancelButton: { paddingTop: 7, paddingHorizontal: 12 },
  cancelText: { color: "#ddd", fontSize: 11 },
});
