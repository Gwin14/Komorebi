import { useCallback, useEffect, useState } from "react";
import { saveLivePhotoToLibrary } from "../../modules/camera-live-photo";
import { saveProcessedPortraitPhoto } from "../../modules/camera-portrait-capture";
import {
  applyExifDataToImage,
  copyExifFromImage,
  cropImageToInverseAspect,
  saveToAlbum,
} from "../utils/cameraUtils";
import { saveKomorebiAssetMetadata } from "../utils/komorebiExifMetadata";

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
        captureMode = "standard",
        exifData = null,
        livePhotoMovieUri,
        localIdentifier,
        depthDataEmbedded = false,
        portraitEffectsMatteEmbedded = false,
      } = item;

      try {
        if (!hasMediaPermission) return;

        if (alreadySaved) {
          return;
        }

        const shouldApplyExifBeforeSaving =
          !item.needsProcessing &&
          captureMode === "standard" &&
          Boolean(exifData);
        const uriToSave = shouldApplyExifBeforeSaving
          ? await applyExifDataToImage(processedUri, exifData)
          : processedUri;
        const komorebiMetadata = exifData?.komorebiMetadata;
        const saveMetadataForAsset = (assetId) =>
          saveKomorebiAssetMetadata(assetId, komorebiMetadata);

        if (livePhotoMovieUri) {
          const result = await saveLivePhotoToLibrary({
            photoUri: uriToSave,
            movieUri: livePhotoMovieUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
          });
          await saveMetadataForAsset(result.localIdentifier || localIdentifier);
        } else if (
          originalUri &&
          (depthDataEmbedded || portraitEffectsMatteEmbedded)
        ) {
          const result = await saveProcessedPortraitPhoto({
            processedPhotoUri: uriToSave,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
          });
          await saveMetadataForAsset(result.localIdentifier || localIdentifier);
        } else if (doubleCaptureMode) {
          const asset = await saveToAlbum(uriToSave);
          await saveMetadataForAsset(asset?.id);

          const inverseUri = await cropImageToInverseAspect(
            uriToSave,
            aspectRatio,
          );
          if (inverseUri) {
            const inverseUriWithExif = await copyExifFromImage(
              uriToSave,
              inverseUri,
            );
            const inverseAsset = await saveToAlbum(inverseUriWithExif);
            await saveMetadataForAsset(inverseAsset?.id);
          }
        } else {
          const asset = await saveToAlbum(uriToSave);
          await saveMetadataForAsset(asset?.id);
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
