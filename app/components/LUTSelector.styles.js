import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    position: "absolute",
    bottom: -50,
    left: 0,
    right: 0,
  },
  selectorSection: {
    width: "100%",
  },
  compactSection: {
    marginTop: 2,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 2,
    display: "none",
  },
  header: {
    padding: 10,
    // borderBottomWidth: 1,
    // borderBottomColor: "#333",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  compactScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 7,
    gap: 8,
  },
  lutButton: {
    alignItems: "center",
    marginRight: 8,
  },
  polaroidButton: {
    padding: 2,
  },
  polaroidButtonSelected: {
    transform: [{ translateY: -2 }],
  },
  polaroid: {
    width: 64,
    height: 76,
    paddingTop: 1,
    paddingHorizontal: 1,
    paddingBottom: 0,
    backgroundColor: "#f7f4ec",
    borderRadius: 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  polaroidSelected: {
    borderColor: "#ffaa00",
    shadowColor: "#ffaa00",
    shadowOpacity: 0.55,
    shadowRadius: 5,
    elevation: 7,
  },
  polaroidPhoto: {
    width: "100%",
    height: 48,
    overflow: "hidden",
  },
  polaroidPhotoHighlight: {
    width: "72%",
    height: "120%",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    transform: [{ rotate: "24deg" }],
  },
  polaroidCaption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  polaroidName: {
    color: "#25231f",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  polaroidNameSelected: {
    color: "#9a5700",
    fontWeight: "800",
  },
  lutPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#444",
    marginBottom: 5,
  },
  lutPreviewSelected: {
    borderColor: "#ffaa00",
    backgroundColor: "#3a3a3a",
  },
  compactPreview: {
    width: 48,
    height: 24,
    borderRadius: 12,
    marginBottom: 3,
  },
  lutIcon: {
    fontSize: 20,
    color: "#fff",
  },
  compactIcon: {
    fontSize: 14,
  },
  lutName: {
    color: "#aaa",
    fontSize: 12,
    textAlign: "center",
    maxWidth: 70,
  },
  lutNameSelected: {
    color: "#ffaa00",
    fontWeight: "600",
  },
});
