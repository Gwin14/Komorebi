import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

export default function useCameraGestures({
  disabled = false,
  lastZoom,
  maxZoom,
  minZoom,
  setZoom,
  zoomSV,
  onZoomStart,
  verticalEnabled = true,
  horizontalEnabled = false,
  onVerticalSwipe,
  onHorizontalSwipe,
}) {
  return useMemo(() => {
    const pinchGesture = Gesture.Pinch()
      .enabled(!disabled)
      .onBegin(() => {
        lastZoom.value = zoomSV.value;
        if (onZoomStart) runOnJS(onZoomStart)();
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

    const verticalGesture = Gesture.Pan()
      .enabled(!disabled && verticalEnabled)
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetY([-20, 20])
      .failOffsetX([-30, 30])
      .onEnd((event, success) => {
        if (!success || Math.abs(event.translationX) > Math.abs(event.translationY)) return;
        if (event.translationY < -50 || event.velocityY < -400) {
          if (onVerticalSwipe) runOnJS(onVerticalSwipe)(1);
        } else if (event.translationY > 50 || event.velocityY > 400) {
          if (onVerticalSwipe) runOnJS(onVerticalSwipe)(-1);
        }
      });

    const horizontalGesture = Gesture.Pan()
      .enabled(!disabled && horizontalEnabled)
      .minPointers(1)
      .maxPointers(1)
      .activeOffsetX([-20, 20])
      .failOffsetY([-30, 30])
      .onEnd((event, success) => {
        if (!success || Math.abs(event.translationY) > Math.abs(event.translationX)) return;
        if (event.translationX > 50 || event.velocityX > 400) {
          if (onHorizontalSwipe) runOnJS(onHorizontalSwipe)(1);
        } else if (event.translationX < -50 || event.velocityX < -400) {
          if (onHorizontalSwipe) runOnJS(onHorizontalSwipe)(-1);
        }
      });

    const doubleTapGesture = Gesture.Tap()
      .enabled(!disabled)
      .numberOfTaps(2)
      .onStart(() => {
        console.log("Double tap detected");
      });

    return Gesture.Simultaneous(
      pinchGesture, Gesture.Race(verticalGesture, horizontalGesture), doubleTapGesture,
    );
  }, [
    disabled,
    lastZoom,
    maxZoom,
    minZoom,
    onZoomStart,
    setZoom,
    zoomSV,
    verticalEnabled,
    horizontalEnabled,
    onVerticalSwipe,
    onHorizontalSwipe,
  ]);
}
