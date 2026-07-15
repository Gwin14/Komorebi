import * as FileSystem from "expo-file-system/legacy";
import * as piexif from "piexifjs";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebView } from "react-native-webview";
import { saveProcessedImage } from "./exifImageWriter";
import { generateRuntimeHTML } from "./lutProcessingHtml";

export const LUTProcessor = ({ imageData, onProcessed, onError }) => {
  const webViewRef = useRef(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef(null);
  const originalExifRef = useRef(null);

  const staticHtml = useMemo(() => generateRuntimeHTML(), []);

  const sendToWebView = useCallback(
    async (data) => {
      try {
        let base64 = data.base64;
        if (!base64 && data.imageUri) {
          base64 = await FileSystem.readAsStringAsync(data.imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        try {
          originalExifRef.current = piexif.load(
            "data:image/jpeg;base64," + base64,
          );
        } catch {
          originalExifRef.current = null;
        }
        const payload = JSON.stringify({
          base64,
          cube: data.cube,
          halationConfig: data.halationConfig || null,
          grainConfig: data.grainConfig || null,
          aspectRatio: data.aspectRatio,
        });
        webViewRef.current?.injectJavaScript(`processImage(${payload}); true;`);
      } catch (e) {
        onError?.(e);
      }
    },
    [onError],
  );

  // Processar item pendente assim que a WebView estiver pronta
  useEffect(() => {
    if (ready && pendingRef.current) {
      sendToWebView(pendingRef.current);
      pendingRef.current = null;
    }
  }, [ready, sendToWebView]);

  // Reagir a novo imageData
  useEffect(() => {
    if (!imageData?.needsProcessing) return;
    if (!ready) {
      pendingRef.current = imageData;
      return;
    }
    sendToWebView(imageData);
  }, [imageData, ready, sendToWebView]);

  const handleMessage = useCallback(
    async (event) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === "success") {
          const savedUri = await saveProcessedImage(
            message.data,
            imageData?.exifData,
            originalExifRef.current,
          );
          if (savedUri) onProcessed?.(savedUri, imageData);
        } else if (message.type === "error") {
          onError?.(new Error(message.message));
        }
      } catch (error) {
        onError?.(error);
      }
    },
    [imageData, onProcessed, onError],
  );

  // WebView sempre montada — sem cold start a cada foto
  return (
    <WebView
      ref={webViewRef}
      source={{ html: staticHtml }}
      onMessage={handleMessage}
      onLoadEnd={() => setReady(true)}
      style={{ width: 0, height: 0, position: "absolute", opacity: 0 }}
      javaScriptEnabled
      domStorageEnabled
    />
  );
};
