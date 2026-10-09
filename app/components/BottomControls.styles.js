import { StyleSheet } from "react-native";

export const BOTTOM_CONTROLS_MARGIN = 8;

export default StyleSheet.create({
  shutterContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: BOTTOM_CONTROLS_MARGIN,
  },
  shutterRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    height: 88,
    paddingHorizontal: 20,
  },
  sideButton: {
    flex: 1,
    alignItems: "center",
  },
  galleryThumbInner: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  galleryImage: {
    width: "100%",
    height: "100%",
  },
  processingBadge: {
    position: "absolute",
    top: -6,
    right: -5,
    minWidth: 30,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#ffaa00",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2,
  },
  processingBadgeText: { color: "#111", fontSize: 11, fontWeight: "700" },
  toolsContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
  },
  retroLensSpacing: {
    marginTop: 12,
  },
  lensSlot: {
    width: "100%",
    height: 34,
    marginTop: 0,
  },
  lutSelectorWrapper: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  rightControls: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  flipButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
});
