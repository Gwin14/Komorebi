import { Audio } from "expo-av";
import { useEffect, useRef } from "react";

export default function useShutterSound() {
  const soundRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      let sound = null;
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
        });

        ({ sound } = await Audio.Sound.createAsync(
          require("../../assets/sounds/shutter.wav"),
          {
            shouldPlay: false,
            volume: 1.0,
          },
        ));

        if (mounted) {
          soundRef.current = sound;
        } else {
          await sound.unloadAsync();
        }
      } catch (error) {
        await sound?.unloadAsync().catch(() => {});
        if (mounted) {
          console.warn("Não foi possível preparar o som do shutter", error);
        }
      }
    })();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const play = async () => {
    if (!soundRef.current) {
      console.warn("Som do shutter ainda não está pronto");
      return;
    }
    try {
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.playAsync();
    } catch (error) {
      console.error("Erro ao tocar som do shutter:", error);
    }
  };

  return play;
}
