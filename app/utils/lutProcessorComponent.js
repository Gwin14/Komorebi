import * as FileSystem from "expo-file-system/legacy";
import * as piexif from "piexifjs";
import React, { useEffect, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import { saveProcessedImage } from "./exifImageWriter";
import { generateProcessingHTML } from "./lutProcessingHtml";

export const LUTProcessor = ({ imageData, onProcessed, onError }) => {
  const webViewRef = useRef(null);
  const [html, setHtml] = useState(null);
  const originalExifRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const prepareData = async () => {
      if (!imageData || !imageData.needsProcessing) return;

      try {
        let base64 = imageData.base64;
        // Carregamento tardio (lazy load) do base64 para não travar a UI na captura
        if (!base64 && imageData.imageUri) {
          base64 = await FileSystem.readAsStringAsync(imageData.imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        if (isMounted && base64) {
          try {
            originalExifRef.current = piexif.load(
              "data:image/jpeg;base64," + base64,
            );
          } catch (e) {
            console.log("Erro ao extrair EXIF original:", e);
            originalExifRef.current = null;
          }

          setHtml(
            generateProcessingHTML(
              base64,
              imageData.cube,
              imageData.grainConfig || null,
              imageData.aspectRatio,
            ),
          );
        }
      } catch (e) {
        if (isMounted && onError) onError(e);
      }
    };

    setHtml(null);
    prepareData();
    return () => {
      isMounted = false;
    };
  }, [imageData, onError]);

  if (!imageData || !imageData.needsProcessing || !html) {
    return null;
  }

  const handleMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "success") {
        const savedUri = await saveProcessedImage(
          message.data,
          imageData.exifData,
          originalExifRef.current,
        );
        if (savedUri && onProcessed) {
          onProcessed(savedUri, imageData);
        }
      } else if (message.type === "error") {
        console.error("Erro no processamento:", message.message);
        if (onError) {
          onError(new Error(message.message));
        }
      }
    } catch (error) {
      console.error("Erro ao processar mensagem do WebView:", error);
      if (onError) {
        onError(error);
      }
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      onMessage={handleMessage}
      style={{ width: 1, height: 1, opacity: 0 }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
    />
  );
};
