import { StyleSheet } from "react-native";

export default StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff0d",
    borderRadius: 12,
    marginVertical: 4,
  },
  wrapperGrouped: {
    minHeight: 58,
    backgroundColor: "transparent",
    borderRadius: 0,
    borderBottomColor: "#292929",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: 0,
  },
  wrapperGroupedLast: {
    borderBottomWidth: 0,
  },
  wrapperDisabled: {
    opacity: 0.48,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  labelBlock: {
    flex: 1,
    paddingRight: 12,
  },
  description: {
    color: "#a9a9a9",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  badge: {
    color: "#d8b66a",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.24)",
  },
  track: {
    width: 52,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#444",
    justifyContent: "center",
  },
  trackActive: {
    backgroundColor: "rgba(255, 170, 0, 0.2)", // Amber suave ao fundo
    borderColor: "#ffaa00",
  },
  trackDisabled: {
    borderColor: "#3a3a3a",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: "#777",
  },
  thumbActive: {
    backgroundColor: "#ffaa00",
    // Efeito de brilho neon similar ao shutter
    shadowColor: "#ffaa00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
});
