import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
    marginTop: 20,
  },
  divider: {
    height: 1,
    width: "90%",
    backgroundColor: "#55555563",
    marginVertical: 12,
  },
  togglesSection: {
    width: "90%",
    marginTop: 20,
  },
  topBarSection: {
    width: "98%",
  },
  lutSection: {
    width: "90%",
  },
  socialIcon: {
    width: 40,
    height: 40,
    aspectRatio: 1,
    resizeMode: "contain",
    marginbottom: 100,
  },
  siteIcon: {
    width: 60,
    height: 60,
    aspectRatio: 1,
    resizeMode: "contain",
    marginbottom: 100,
    borderRadius: "50%",
  },
  socialContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "90%",
    marginTop: 20,
  },
  customLutList: {
    width: "100%",
    paddingTop: 12,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  draggableList: {
    width: "100%",
    marginTop: -12,
  },
  draggableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff0d",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  draggingRow: {
    backgroundColor: "rgba(255, 170, 0, 0.2)",
    borderLeftColor: "#fff",
  },
  controlRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dragHandle: {
    padding: 8,
    marginRight: 4,
  },
  controlName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  smallButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  smallButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  availableList: {
    width: "100%",
    paddingHorizontal: 16,
  },
  availableItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ffffff0d",
  },
  availableIcon: {
    marginRight: 10,
  },
  linkButtonWrapper: {
    width: "100%",
    alignItems: "center",
  },
  siteButton: {
    width: "90%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 50,
    marginTop: 20,
    borderWidth: 4,
    borderColor: "#191919af",
    padding: 12,
    borderRadius: 12,
  },
  siteTitle: {
    fontWeight: "bold",
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
  backButton: {
    position: "absolute",
    top: 59,
    left: 16,
    zIndex: 10,
  },
});
