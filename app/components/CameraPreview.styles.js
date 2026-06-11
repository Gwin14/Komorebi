import { StyleSheet } from "react-native";

export default StyleSheet.create({
  cameraWrapper: {
    width: "100%",
    overflow: "hidden",
  },
  retroStyle: {
    alignSelf: "center",
    width: "90%",
    overflow: "hidden",
    borderRadius: 10,
  },
  camera: { flex: 1 },
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  gridLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  focusSquare: {
    position: "absolute",
    width: 76,
    height: 76,
    marginLeft: -38,
    marginTop: -38,
    borderWidth: 1.5,
    borderColor: "#ffcc00",
    borderRadius: 6,
  },
});
