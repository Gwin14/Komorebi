import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(17, 17, 17, 0.8)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  name: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
    fontWeight: "500",
  },
  deleteButton: {
    backgroundColor: "rgba(170, 34, 34, 0.9)",
    borderRadius: 8,
    padding: 8,
    marginLeft: 12,
  },
  deleteButtonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(170, 34, 34, 0.7)",
  },
});
