import { StyleSheet } from "react-native";

export default StyleSheet.create({
  trigger: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  triggerCompact: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  triggerLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    maxWidth: 160,
  },
  popover: {
    backgroundColor: "#1c1c1e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    width: 260,
  },
  container: {
    maxHeight: 360,
    padding: 14,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  list: {
    maxHeight: 220,
  },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  itemActive: {
    backgroundColor: "rgba(255,170,0,0.12)",
  },
  itemLabel: {
    flex: 1,
    color: "#cfcfcf",
    fontSize: 15,
  },
  itemLabelActive: {
    color: "#ffaa00",
    fontWeight: "600",
  },
  newButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,170,0,0.4)",
  },
  newButtonText: {
    color: "#ffaa00",
    fontSize: 14,
    fontWeight: "600",
  },
  createContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  createActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelText: {
    color: "#cfcfcf",
    fontSize: 14,
  },
  addButton: {
    backgroundColor: "#ffaa00",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addText: {
    color: "#111",
    fontSize: 14,
    fontWeight: "700",
  },
});
