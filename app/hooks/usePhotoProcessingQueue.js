import { useCallback, useEffect, useState } from "react";
import {
  copyExifFromImage,
  cropImageToInverseAspect,
  saveToAlbum,
} from "../utils/cameraUtils";

export default function usePhotoProcessingQueue(hasMediaPermission) {
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);

  const enqueueProcessing = useCallback((data) => {
    setProcessingQueue((prev) => [...prev, data]);
  }, []);

  const removeCurrentProcessing = useCallback(() => {
    setProcessingQueue((prev) => prev.slice(1));
  }, []);

  const handleProcessed = useCallback(
    async (processedUri, item = {}) => {
      const {
        doubleCaptureMode = false,
        saveOriginalWithoutEffects = false,
        originalUri,
        aspectRatio = 3 / 4,
      } = item;

      try {
        if (!hasMediaPermission) return;

        if (doubleCaptureMode) {
          await saveToAlbum(processedUri);

          const inverseUri = await cropImageToInverseAspect(
            processedUri,
            aspectRatio,
          );
          if (inverseUri) {
            const inverseUriWithExif = await copyExifFromImage(
              processedUri,
              inverseUri,
            );
            await saveToAlbum(inverseUriWithExif);
          }
        } else {
          await saveToAlbum(processedUri);
        }

        if (saveOriginalWithoutEffects && originalUri) {
          await saveToAlbum(originalUri);
        }
      } catch (error) {
        console.error("Erro ao salvar imagem processada:", error);
      } finally {
        removeCurrentProcessing();
        setGalleryRefreshKey((value) => value + 1);
      }
    },
    [hasMediaPermission, removeCurrentProcessing],
  );

  useEffect(() => {
    const item = processingQueue[0];
    if (!item || item.needsProcessing) return;

    handleProcessed(item.originalUri, item);
  }, [handleProcessed, processingQueue]);

  return {
    enqueueProcessing,
    galleryRefreshKey,
    handleProcessed,
    isProcessing,
    processingQueue,
    removeCurrentProcessing,
    setIsProcessing,
  };
}
