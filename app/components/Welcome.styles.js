import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },

  gradientWrapper: {
    position: "absolute",
    height: 2000,
    width: 2000,
    top: "-80%",
    left: "-80%",
  },

  gradient: {
    height: 3000,
    width: 3000,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  image: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },

  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },

  text: {
    color: "#fff",
    textAlign: "center",
    marginVertical: 10,
    fontSize: 16,
  },
});
