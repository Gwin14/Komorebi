import * as FileSystem from "expo-file-system/legacy";
import * as piexif from "piexifjs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import { saveProcessedImage } from "./exifImageWriter";
import { generateRuntimeHTML } from "./lutProcessingHtml";

// Module-level generation is refreshed together with this dependency during
// Fast Refresh, while remaining stable across normal component renders.
const STATIC_PROCESSING_HTML = generateRuntimeHTML();

export const LUTProcessor = ({ imageData, onProcessed, onError }) => {
  const webViewRef = useRef(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef(null);
  const requestCounterRef = useRef(0);
  const activeRequestRef = useRef(null);
  const dispatchedDataRef = useRef(new WeakSet());

  useEffect(
    () => () => {
      activeRequestRef.current = null;
      pendingRef.current = null;
    },
    [],
  );

  const sendToWebView = useCallback(
    async (data) => {
      if (dispatchedDataRef.current.has(data)) return;
      dispatchedDataRef.current.add(data);
      const requestId = ++requestCounterRef.current;
      const request = {
        id: requestId,
        data,
        originalExif: null,
        settling: false,
      };
      activeRequestRef.current = request;
      try {
        let base64 = data.base64;
        if (!base64 && data.imageUri) {
          base64 = await FileSystem.readAsStringAsync(data.imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        if (activeRequestRef.current !== request) return;
        try {
          const exifSourceBase64 =
            data.originalUri && data.originalUri !== data.imageUri
              ? await FileSystem.readAsStringAsync(data.originalUri, {
                  encoding: FileSystem.EncodingType.Base64,
                })
              : base64;
          if (activeRequestRef.current !== request) return;
          request.originalExif = piexif.load(
            "data:image/jpeg;base64," + exifSourceBase64,
          );
        } catch {
          request.originalExif = null;
        }
        if (activeRequestRef.current !== request) return;
        const payload = JSON.stringify({
          requestId,
          base64,
          cube: data.cube,
          halationConfig: data.halationConfig || null,
          grainConfig: data.grainConfig || null,
          aspectRatio: data.aspectRatio,
        });
        webViewRef.current?.injectJavaScript(`processImage(${payload}); true;`);
      } catch (e) {
        if (activeRequestRef.current?.id === requestId) {
          activeRequestRef.current = null;
          onError?.(e);
        }
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
    if (!imageData?.needsProcessing) {
      pendingRef.current = null;
      return;
    }
    if (!ready) {
      pendingRef.current = imageData;
      return;
    }
    sendToWebView(imageData);
  }, [imageData, ready, sendToWebView]);

  const handleMessage = useCallback(
    async (event) => {
      const request = activeRequestRef.current;
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (!request || message.requestId !== request.id || request.settling)
          return;
        if (message.type === "success") {
          request.settling = true;
          const savedUri = await saveProcessedImage(
            message.data,
            request.data.exifData,
            request.originalExif,
          );
          if (activeRequestRef.current?.id !== request.id) return;
          activeRequestRef.current = null;
          if (savedUri) onProcessed?.(savedUri, request.data);
          else onError?.(new Error("Falha ao salvar a imagem processada"));
        } else if (message.type === "error") {
          activeRequestRef.current = null;
          onError?.(new Error(message.message));
        }
      } catch (error) {
        if (request && activeRequestRef.current === request) {
          activeRequestRef.current = null;
          onError?.(error);
        }
      }
    },
    [onProcessed, onError],
  );

  // WebView sempre montada — sem cold start a cada foto
  return (
    <WebView
      ref={webViewRef}
      source={{ html: STATIC_PROCESSING_HTML }}
      onMessage={handleMessage}
      onLoadEnd={() => setReady(true)}
      style={{ width: 0, height: 0, position: "absolute", opacity: 0 }}
      javaScriptEnabled
      domStorageEnabled
    />
  );
};
