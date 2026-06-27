import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    alignItems: "center",
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  tabActive: {
    backgroundColor: "rgba(255, 170, 0, 0.2)",
  },
  tabLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#ffaa00",
  },
});
