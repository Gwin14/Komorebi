import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { saveLivePhotoToLibrary } from "../../modules/camera-live-photo";
import {
  makePhotoStylesCompatible,
  updatePhotoAssetMetadata,
} from "../../modules/camera-photographic-styles";
import {
  convertPhotoFormat,
  saveProcessedPortraitPhoto,
} from "../../modules/camera-portrait-capture";
import {
  applyExifDataToImage,
  copyExifFromImage,
  cropImageToAspect,
  cropImageToInverseAspect,
  saveToAlbum,
} from "../utils/cameraUtils";
import { saveKomorebiAssetMetadata } from "../utils/komorebiExifMetadata";

export default function usePhotoProcessingQueue(
  hasMediaPermission,
  activeProject = null,
) {
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
    async (processedUri, item = {}, project = activeProject) => {
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
        outputFormat = "jpeg",
        preserveApplePhotographicStyles = false,
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
        const removeStylesTemporaryFile = async (uri) => {
          if (!uri) return;
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
          } catch (cleanupError) {
            console.warn(
              "Falha ao remover HEIF temporário dos Estilos Apple:",
              cleanupError,
            );
          }
        };
        const prepareRegularPhoto = async (uri, metadataSourceUri = originalUri) => {
          if (preserveApplePhotographicStyles) {
            const result = await makePhotoStylesCompatible(uri, {
              metadata: exifData,
              metadataSourceUri,
            });
            if (!result?.verified || !result?.photoUri) {
              await removeStylesTemporaryFile(result?.photoUri);
              throw new Error("O HEIF gerado não passou na validação dos Estilos Fotográficos");
            }
            return result.photoUri;
          }

          try {
            return await convertPhotoFormat({
              photoUri: uri,
              metadataSourceUri,
              outputFormat,
            });
          } catch (error) {
            console.warn("Falha ao converter formato da foto:", error);
            return uri;
          }
        };
        const saveRegularPhoto = async (
          uri,
          metadataSourceUri = originalUri,
        ) => {
          let preparedUri = null;
          try {
            preparedUri = await prepareRegularPhoto(uri, metadataSourceUri);
            const asset = await saveToAlbum(project, preparedUri);
            mainAssetSaved = true;
            if (preserveApplePhotographicStyles) {
              if (!asset?.id) {
                throw new Error(
                  "O Fotos não retornou o identificador do asset salvo",
                );
              }
              const metadataUpdated = await updatePhotoAssetMetadata(asset.id, {
                metadata: exifData,
                metadataSourceUri,
              });
              if (!metadataUpdated) {
                throw new Error(
                  "O asset salvo não foi localizado para sincronizar data e localização",
                );
              }
            }
            return asset;
          } finally {
            if (
              preserveApplePhotographicStyles &&
              preparedUri &&
              preparedUri !== uri
            ) {
              await removeStylesTemporaryFile(preparedUri);
            }
          }
        };

        if (captureMode === "raw") {
          const rawAsset = await saveToAlbum(project,originalUri || processedUri);
          mainAssetSaved = true;
          await saveMetadataForAsset(rawAsset?.id);

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
          const derivedAsset = await saveRegularPhoto(
            derivedWithExif,
            derivativeSourceUri,
          );
          await saveMetadataForAsset(derivedAsset?.id);
        } else if (livePhotoMovieUri) {
          const result = await saveLivePhotoToLibrary({
            photoUri: uriToSave,
            movieUri: livePhotoMovieUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
            outputFormat,
          });
          mainAssetSaved = true;
          await saveMetadataForAsset(result.localIdentifier || localIdentifier);
          if (doubleCaptureMode) {
            const inverseUri = await cropImageToInverseAspect(
              uriToSave,
              aspectRatio,
            );
            if (!inverseUri)
              throw new Error("Falha na segunda foto da Live Photo");
            const inverseWithExif = await copyExifFromImage(
              uriToSave,
              inverseUri,
            );
            const inverseAsset = await saveRegularPhoto(inverseWithExif);
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
            outputFormat,
          });
          mainAssetSaved = true;
          await saveMetadataForAsset(result.localIdentifier || localIdentifier);
          if (doubleCaptureMode) {
            const inverseUri = await cropImageToInverseAspect(
              uriToSave,
              aspectRatio,
            );
            if (!inverseUri)
              throw new Error("Falha na segunda foto do retrato");
            const inverseWithExif = await copyExifFromImage(
              uriToSave,
              inverseUri,
            );
            const inverseAsset = await saveRegularPhoto(inverseWithExif);
            await saveMetadataForAsset(inverseAsset?.id);
          }
        } else if (doubleCaptureMode) {
          const asset = await saveRegularPhoto(uriToSave);
          await saveMetadataForAsset(asset?.id);

          const inverseUri = await cropImageToInverseAspect(
            uriToSave,
            aspectRatio,
          );
          if (!inverseUri) throw new Error("Falha na segunda foto da captura");
          const inverseUriWithExif = await copyExifFromImage(
            uriToSave,
            inverseUri,
          );
          const inverseAsset = await saveRegularPhoto(inverseUriWithExif);
          await saveMetadataForAsset(inverseAsset?.id);
        } else {
          const asset = await saveRegularPhoto(uriToSave);
          await saveMetadataForAsset(asset?.id);
        }

        if (saveOriginalWithoutEffects && originalUri) {
          const originalAsset = await saveRegularPhoto(
            originalUri,
            originalUri,
          );
          await saveMetadataForAsset(originalAsset?.id);
        }
      } catch (error) {
        console.error("Erro ao salvar imagem processada:", error);
        Alert.alert(
          mainAssetSaved
            ? "Captura salva parcialmente"
            : "Falha ao salvar captura",
          mainAssetSaved
            ? "O arquivo principal foi preservado, mas uma versão derivada não pôde ser criada."
            : "Não foi possível salvar o arquivo principal desta captura.",
        );
      } finally {
        removeCurrentProcessing();
        setGalleryRefreshKey((value) => value + 1);
      }
    },
    [hasMediaPermission, removeCurrentProcessing, activeProject],
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
