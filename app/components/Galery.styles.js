import { StyleSheet } from "react-native";

export default StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "105%",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  exifFrameButton: {
    marginRight: 15,
    padding: 6,
    borderRadius: 6,
  },
  badgeContainer: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "flex-end",
    paddingHorizontal: 6,
    borderWidth: 0,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 5,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 11,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    paddingHorizontal: 32,
  },
  permissionText: {
    color: "#f5f5f5",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#f5f5f5",
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  permissionButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "600",
  },
  navigationBar: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 32,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    color: "#a7a7a7",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 12,
    marginTop: 15,
  },
  photoRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 7,
  },
  photoItem: {
    flex: 1,
  },
  photoPlaceholder: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: "#f5f5f5",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 7,
  },
  emptyText: {
    color: "#8c8c8c",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  image: {
    width: "100%",
    aspectRatio: 0.76,
    backgroundColor: "#151515",
    borderRadius: 19,
  },
  modal: {
    flex: 1,
    backgroundColor: "#000000",
  },
  modalContent: {
    alignItems: "center",
    paddingBottom: 40,
  },
  selectedImage: {
    width: "100%",
    height: 350,
  },
  infoTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 20,
    margin: 10,
    textAlign: "left",
    paddingLeft: 15,
  },
  exifFrameIcon: {
    width: 30,
    height: 30,
  },
  efixContainer: {
    flexDirection: "row", // organiza os itens horizontalmente
    flexWrap: "wrap", // permite quebra de linha
    justifyContent: "space-between", // espaçamento entre as colunas
    padding: 10,
  },
  exifItemWrapper: {
    width: "45%", // cerca de metade da tela (menos espaço de margem)
    marginBottom: 10,
  },
  mapContainer: {
    width: "95%",
    marginBottom: 20,
  },
  modalActions: {
    width: "100%",
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
  },
});
