import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { saveLivePhotoToLibrary } from "../../modules/camera-live-photo";
import { saveProcessedPortraitPhoto } from "../../modules/camera-portrait-capture";
import {
  applyExifDataToImage,
  copyExifFromImage,
  cropImageToAspect,
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
      let mainAssetSaved = false;
      const {
        alreadySaved = false,
        doubleCaptureMode = false,
        saveOriginalWithoutEffects = false,
        originalUri,
        aspectRatio = 3 / 4,
        captureMode = "standard",
        exifData = null,
        livePhotoMovieUri,
        localIdentifier,
        depthDataEmbedded = false,
        portraitEffectsMatteEmbedded = false,
        derivativeSourceUri,
        rawDerivativeAspectRatio,
      } = item;

      try {
        if (!hasMediaPermission) return;

        if (alreadySaved) {
          return;
        }

        const shouldApplyExifBeforeSaving =
          !item.needsProcessing &&
          captureMode !== "raw" &&
          Boolean(exifData);
        const uriToSave = shouldApplyExifBeforeSaving
          ? await applyExifDataToImage(processedUri, exifData, originalUri)
          : processedUri;
        const komorebiMetadata = exifData?.komorebiMetadata;
        const saveMetadataForAsset = (assetId) =>
          saveKomorebiAssetMetadata(assetId, komorebiMetadata);

        if (captureMode === "raw") {
          const rawAsset = await saveToAlbum(originalUri || processedUri);
          await saveMetadataForAsset(rawAsset?.id);
          mainAssetSaved = true;

          if (rawDerivativeAspectRatio == null) {
            return;
          }

          if (!derivativeSourceUri) {
            throw new Error("Imagem processada do RAW não foi retornada");
          }

          const derivedUri = await cropImageToAspect(
            derivativeSourceUri,
            rawDerivativeAspectRatio,
          );
          if (!derivedUri) throw new Error("Falha no derivado do RAW");
          const derivedWithExif = await copyExifFromImage(
            derivativeSourceUri,
            derivedUri,
          );
          const derivedAsset = await saveToAlbum(derivedWithExif);
          await saveMetadataForAsset(derivedAsset?.id);
        } else if (livePhotoMovieUri) {
          const result = await saveLivePhotoToLibrary({
            photoUri: uriToSave,
            movieUri: livePhotoMovieUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
          });
          await saveMetadataForAsset(result.localIdentifier || localIdentifier);
          mainAssetSaved = true;
          if (doubleCaptureMode) {
            const inverseUri = await cropImageToInverseAspect(
              uriToSave,
              aspectRatio,
            );
            if (!inverseUri) throw new Error("Falha na segunda foto da Live Photo");
            const inverseWithExif = await copyExifFromImage(uriToSave, inverseUri);
            const inverseAsset = await saveToAlbum(inverseWithExif);
            await saveMetadataForAsset(inverseAsset?.id);
          }
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
          mainAssetSaved = true;
          if (doubleCaptureMode) {
            const inverseUri = await cropImageToInverseAspect(
              uriToSave,
              aspectRatio,
            );
            if (!inverseUri) throw new Error("Falha na segunda foto do retrato");
            const inverseWithExif = await copyExifFromImage(uriToSave, inverseUri);
            const inverseAsset = await saveToAlbum(inverseWithExif);
            await saveMetadataForAsset(inverseAsset?.id);
          }
        } else if (doubleCaptureMode) {
          const asset = await saveToAlbum(uriToSave);
          await saveMetadataForAsset(asset?.id);
          mainAssetSaved = true;

          const inverseUri = await cropImageToInverseAspect(
            uriToSave,
            aspectRatio,
          );
          if (!inverseUri) throw new Error("Falha na segunda foto da captura");
          const inverseUriWithExif = await copyExifFromImage(
            uriToSave,
            inverseUri,
          );
          const inverseAsset = await saveToAlbum(inverseUriWithExif);
          await saveMetadataForAsset(inverseAsset?.id);
        } else {
          const asset = await saveToAlbum(uriToSave);
          await saveMetadataForAsset(asset?.id);
          mainAssetSaved = true;
        }

        if (saveOriginalWithoutEffects && originalUri) {
          await saveToAlbum(originalUri);
        }
      } catch (error) {
        console.error("Erro ao salvar imagem processada:", error);
        Alert.alert(
          mainAssetSaved ? "Captura salva parcialmente" : "Falha ao salvar captura",
          mainAssetSaved
            ? "O arquivo principal foi preservado, mas uma versão derivada não pôde ser criada."
            : "Não foi possível salvar o arquivo principal desta captura.",
        );
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

    handleProcessed(item.imageUri || item.originalUri, item);
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
