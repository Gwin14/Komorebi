import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 6,
    borderBottomColor: "#292929",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
    fontWeight: "500",
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginLeft: 12,
  },
  deleteButtonPressed: {
    backgroundColor: "rgba(255, 116, 116, 0.1)",
  },
});
