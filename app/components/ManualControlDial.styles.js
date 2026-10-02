import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    width: 108,
    height: 40,
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  items: {
    height: 36,
    justifyContent: "center",
  },
  label: {
    position: "absolute",
    left: 36,
    width: 36,
    color: "#fff",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  labelActive: {
    color: "#ffaa00",
  },
  selectionMarker: {
    position: "absolute",
    left: 45,
    bottom: 4,
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#ffaa00",
  },
});
