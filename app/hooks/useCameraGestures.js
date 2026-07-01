import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

export default function useCameraGestures({
  lastZoom,
  maxZoom,
  minZoom,
  setZoom,
  zoomSV,
  showLuts,
  hideLuts,
}) {
  return useMemo(() => {
    const pinchGesture = Gesture.Pinch()
      .onBegin(() => {
        lastZoom.value = zoomSV.value;
      })
      .onUpdate((event) => {
        // Zoom multiplicativo: o fator é proporcional ao zoom atual, então a
        // sensibilidade é uniforme em toda a faixa (não fica sensível no início
        // nem lento para voltar quando está muito ampliado).
        const nextZoom = Math.min(
          Math.max(lastZoom.value * event.scale, minZoom),
          maxZoom,
        );

        zoomSV.value = nextZoom;
        runOnJS(setZoom)(nextZoom);
      });

    // Arrastar para cima revela os LUTs, arrastar para baixo esconde — igual
    // tocar no botão de LUTs.
    const panGesture = Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetY([-20, 20])
      .failOffsetX([-30, 30])
      .onEnd((event) => {
        const swipeUp = event.translationY < -50 || event.velocityY < -400;
        const swipeDown = event.translationY > 50 || event.velocityY > 400;

        if (swipeUp && showLuts) {
          runOnJS(showLuts)();
        } else if (swipeDown && hideLuts) {
          runOnJS(hideLuts)();
        }
      });

    const doubleTapGesture = Gesture.Tap()
      .numberOfTaps(2)
      .onStart(() => {
        console.log("Double tap detected");
      });

    return Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  }, [lastZoom, maxZoom, minZoom, setZoom, zoomSV, showLuts, hideLuts]);
}
