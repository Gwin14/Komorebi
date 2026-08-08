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

  // Popover — mesmo visual do painel de clima (PhotoWeather).
  popover: {
    backgroundColor: "transparent",
  },
  container: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(8,8,8,0.72)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 230,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingBottom: 9,
    paddingTop: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 23,
  },
  rowLabelContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  rowLabel: {
    color: "rgba(255,255,255,0.88)",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  rowLabelActive: {
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
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "600",
  },
  addButton: {
    backgroundColor: "#ffaa00",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addText: {
    color: "#111",
    fontSize: 11,
    fontWeight: "700",
  },
  newButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
  },
  newButtonText: {
    color: "#ffaa00",
    fontSize: 11,
    fontWeight: "600",
  },
});
