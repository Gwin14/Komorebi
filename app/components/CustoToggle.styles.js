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
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.5,
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
