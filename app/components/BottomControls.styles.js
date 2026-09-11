import { StyleSheet } from "react-native";

export const BOTTOM_CONTROLS_MARGIN = 54;

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
    height: 100,
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
  shimmerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  shimmerGradient: {
    flex: 1,
  },
  toolsContainer: {
    width: "100%",

    justifyContent: "center",
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
