import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    position: "absolute",
    width: 160,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(8,8,8,0.58)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
    paddingHorizontal: 1,
  },
  label: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  liveLabel: {
    color: "#ffaa00",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
