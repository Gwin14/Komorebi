import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  exposureText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    fontVariant: ["tabular-nums"], // Evita o texto de "tremer" mudando de largura
    letterSpacing: 0.5,
  },
  exposureTextBelow: {
    marginTop: 8,
    marginBottom: 0,
  },
  dialContainer: {
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    overflow: "hidden", // Mantém os traços fora do limite invisíveis
    justifyContent: "center",
    alignItems: "flex-start", // Alinha no início para o translateX fazer sentido
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  ruleTrack: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    paddingLeft: 0,
    paddingRight: 0,
  },
  tickSlot: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  tick: {
    width: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 1,
  },
  minorTick: {
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  majorTick: {
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    width: 2,
  },
  centerTickStyle: {
    backgroundColor: "#FFD700", // Um toque sutil de dourado/amarelo no zero (opcional)
    height: 22,
  },
  centerIndicator: {
    position: "absolute",
    left: "50%",
    marginLeft: -1, // Metade da largura para alinhar perfeitamente no centro
    width: 2,
    height: 28,
    backgroundColor: "#FF3B30", // Vermelho clássico estilo leica/agulha de câmera
    borderRadius: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
  },
});
