import { StyleSheet } from "react-native";

const LINE_COLOR = "rgba(255, 255, 255, 0.72)";

export default StyleSheet.create({
  overlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 146,
    height: 90,
    marginLeft: -73,
    marginTop: -45,
  },
  line: {
    backgroundColor: LINE_COLOR,
  },
  lineAligned: {
    backgroundColor: "#ffaa00",
  },
  sideLine: {
    position: "absolute",
    top: 44,
    width: 34,
    height: 1,
    borderRadius: 1,
  },
  leftLine: {
    left: 0,
  },
  rightLine: {
    right: 0,
  },
  centerLine: {
    position: "absolute",
    top: 44,
    left: 49,
    width: 48,
    height: 1,
    borderRadius: 1,
  },
});
