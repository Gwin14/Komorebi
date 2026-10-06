import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  previewContainer: {
    position: "relative",
    width: "100%",
    flexGrow: 0,
    // Reserve the full preview height before distributing space to controls.
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
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
  topBarBelow: {
    width: "96%",
    paddingHorizontal: 2,
    paddingVertical: 2,
    margin: "auto",
    borderRadius: 14,
  },
  adjustmentControlsSlot: {
    width: "100%",
    height: 64,
    justifyContent: "flex-end",
    marginBottom: 0,
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
  permissionButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 24,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: "#ffb21d",
  },
  permissionButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "800",
  },
  permissionButtonPressed: {
    opacity: 0.76,
  },
  permissionBanner: {
    position: "absolute",
    right: 14,
    bottom: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 178, 29, 0.28)",
    borderRadius: 18,
    backgroundColor: "rgba(10, 10, 10, 0.92)",
  },
  permissionBannerIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 178, 29, 0.12)",
  },
  permissionBannerCopy: {
    flex: 1,
  },
  permissionBannerTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  permissionBannerText: {
    marginTop: 2,
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: 11,
    lineHeight: 15,
  },
  permissionButtonCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#ffb21d",
  },
  permissionButtonCompactText: {
    color: "#111",
    fontSize: 11,
    fontWeight: "800",
  },
});
