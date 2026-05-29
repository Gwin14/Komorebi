import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

export default function useCameraGestures({
  lastZoom,
  maxZoom,
  minZoom,
  setZoom,
  zoomSV,
}) {
  return useMemo(() => {
    const pinchGesture = Gesture.Pinch()
      .onBegin(() => {
        lastZoom.value = zoomSV.value;
      })
      .onUpdate((event) => {
        const normalized = (lastZoom.value - minZoom) / (maxZoom - minZoom);
        const nextNormalized = Math.min(
          Math.max(normalized + (event.scale - 1) * 0.25, 0),
          1,
        );
        const nextZoom = minZoom + nextNormalized * (maxZoom - minZoom);

        zoomSV.value = nextZoom;
        runOnJS(setZoom)(nextZoom);
      });

    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .onStart(() => {
        console.log("Double tap detected");
      });

    return Gesture.Simultaneous(pinchGesture, doubleTapGesture);
  }, [lastZoom, maxZoom, minZoom, setZoom, zoomSV]);
}
