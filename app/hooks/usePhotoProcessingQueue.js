import { useCallback, useEffect, useState } from "react";
import { saveLivePhotoToLibrary } from "../../modules/camera-live-photo";
import { saveProcessedPortraitPhoto } from "../../modules/camera-portrait-capture";
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
        alreadySaved = false,
        doubleCaptureMode = false,
        saveOriginalWithLUT: saveOriginalWithoutLUT = false,
        originalUri,
        aspectRatio = 3 / 4,
        livePhotoMovieUri,
        depthDataEmbedded = false,
        portraitEffectsMatteEmbedded = false,
      } = item;

      try {
        if (!hasMediaPermission) return;

        if (alreadySaved) {
          return;
        }

        if (livePhotoMovieUri) {
          await saveLivePhotoToLibrary({
            photoUri: processedUri,
            movieUri: livePhotoMovieUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
          });
        } else if (
          originalUri &&
          (depthDataEmbedded || portraitEffectsMatteEmbedded)
        ) {
          await saveProcessedPortraitPhoto({
            processedPhotoUri: processedUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
          });
        } else if (doubleCaptureMode) {
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

        if (saveOriginalWithoutLUT && originalUri) {
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

    handleProcessed(item.originalUri || item.imageUri, item);
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
