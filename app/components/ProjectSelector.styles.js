import { StyleSheet } from "react-native";

export default StyleSheet.create({
  // Gatilho (botão da topbar / galeria) — discreto, combina com a UI escura.
  trigger: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  menuTrigger: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  menuSectionLabel: {
    color: "#999",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 2,
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

  // Popover — segue os seletores de timer e formato.
  popover: {
    backgroundColor: "transparent",
  },
  container: {
    width: 260,
    backgroundColor: "rgba(18,18,18,0.97)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
  },
  header: {
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  list: {
    maxHeight: 220,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    paddingVertical: 12,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    marginBottom: 6,
  },
  rowLabelContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    flex: 1,
  },
  rowLabel: {
    color: "#fff",
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  rowActive: {
    borderColor: "rgba(255,170,0,0.7)",
    backgroundColor: "rgba(255,170,0,0.12)",
  },
  rowLabelActive: {
    fontWeight: "700",
    color: "#ffaa00",
  },
  divider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 1,
    marginVertical: 8,
  },

  // Formulário de criação — reaproveita as cores/espaçamentos do painel.
  createContainer: {
    marginTop: 4,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  createActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  cancelText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "600",
  },
  addButton: {
    backgroundColor: "#ffaa00",
    borderRadius: 8,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  addText: {
    color: "#111",
    fontSize: 13,
    fontWeight: "700",
  },
  newButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
  },
  newButtonText: {
    color: "#ffaa00",
    fontSize: 13,
    fontWeight: "600",
  },
  swipeRowContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 10,
    marginBottom: 6,
  },
  swipeDeleteButton: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: "#ff4444",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeOption: {
    marginBottom: 0,
  },
  swipeRow: {
    backgroundColor: "#121212",
  },
});
