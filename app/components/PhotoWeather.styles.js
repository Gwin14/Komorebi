import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    borderRadius: 12,
    alignSelf: "flex-start",
    overflow: "hidden",
    padding: 12,
    backgroundColor: "#00000087",
  },
  text: {
    color: "white",
    marginBottom: 4,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8e8e87b",
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
