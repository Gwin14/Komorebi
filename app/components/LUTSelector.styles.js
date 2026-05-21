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
    padding: 16,
    gap: 12,
  },
  lutButton: {
    alignItems: "center",
    marginRight: 12,
  },
  lutPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#444",
    marginBottom: 8,
  },
  lutPreviewSelected: {
    borderColor: "#ffaa00",
    backgroundColor: "#3a3a3a",
  },
  lutIcon: {
    fontSize: 24,
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
