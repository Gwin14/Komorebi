import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "stretch",
    justifyContent: "space-between",
  },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    zIndex: 2000,
  },
  shutterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "black",
    zIndex: 3000,
  },
  hiddenProcessor: {
    position: "absolute",
    width: 0,
    height: 0,
    overflow: "hidden",
  },
  appleStylesPaused: {
    position: "absolute",
    top: 104,
    alignSelf: "center",
    maxWidth: "88%",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    zIndex: 1200,
  },
  appleStylesPausedText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  topBarBelow: {
    width: "96%",
    paddingHorizontal: 2,
    paddingVertical: 4,
    margin: "auto",
    borderRadius: 14,
  },

  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  permissionTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },

  permissionText: {
    color: "#b0b0b0",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
});
