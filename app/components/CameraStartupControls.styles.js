import { StyleSheet } from "react-native";

export default StyleSheet.create({
  slot: { width: "100%", flexShrink: 0 },
  overlay: { ...StyleSheet.absoluteFillObject },
  viewfinder: {
    alignSelf: "center",
    width: "100%",
    height: "100%",
    backgroundColor: "#101010",
  },
  topRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 4,
  },
  placeholder: { backgroundColor: "#202020" },
  topControl: { width: 38, height: 38, borderRadius: 11 },
  adjustment: {
    height: 64,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  adjustmentTrack: {
    width: 176,
    height: 6,
    borderRadius: 3,
    marginBottom: 17,
  },
  shutter: {
    width: 80,
    height: 80,
    marginHorizontal: 20,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "#303030",
    backgroundColor: "#111111",
  },
  flip: { width: 54, height: 54, borderRadius: 8 },
  lenses: {
    height: 34,
    marginTop: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lens: { width: 38, height: 26, borderRadius: 13 },
});
