import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(8,8,8,0.72)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 230,
    overflow: "hidden",
    paddingBottom: 9,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  liveLabel: {
    color: "#ffaa00",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  loadingText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    paddingVertical: 8,
  },
  locationRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 6,
  },
  locationText: {
    color: "rgba(255,255,255,0.88)",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  divider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 1,
    marginVertical: 8,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 23,
  },
  rowLabelContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  rowLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
  },
  rowValue: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginLeft: 16,
  },
});
