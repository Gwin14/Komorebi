import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    // backgroundColor: "#1a1a1a",
    // borderTopLeftRadius: 20,
    // borderTopRightRadius: 20,
  },
  selectorSection: {
    width: "100%",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 2,
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
    paddingBottom: 10,
    gap: 8,
  },
  lutButton: {
    alignItems: "center",
    marginRight: 8,
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
  lutIcon: {
    fontSize: 20,
    color: "#fff",
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
