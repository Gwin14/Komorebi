import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { analyzePhoto } from "../../modules/composition-scan";
import { saveLivePhotoToLibrary } from "../../modules/camera-live-photo";
import {
  deletePhotographicStylesTemporaryPhoto,
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
import {
  applyPhotoIntelligenceToMetadata,
  buildIntelligentFilename,
  normalizePhotoIntelligence,
} from "../utils/photoIntelligence";

const PHOTO_INTELLIGENCE_TIMEOUT_MS = 45000;

const withTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("A classificação local excedeu o tempo limite")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const extensionForUri = (uri, fallback = "jpg") => {
  const match = String(uri || "").split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return match?.[1] || fallback;
};

export default function usePhotoProcessingQueue(
  hasMediaPermission,
  activeProject = null,
  intelligenceOptions = {},
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

        const generateTags = Boolean(intelligenceOptions.generateTags);
        const generateFilename = Boolean(intelligenceOptions.generateFilename);
        const capturedAt = new Date();
        let intelligence = null;
        if (generateTags || generateFilename) {
          const analysisUri =
            captureMode === "raw"
              ? derivativeSourceUri || processedUri
              : processedUri;
          try {
            const result = await withTimeout(
              analyzePhoto({
                imageUri: analysisUri,
                generateTags,
                generateFilename,
              }),
              PHOTO_INTELLIGENCE_TIMEOUT_MS,
            );
            intelligence = normalizePhotoIntelligence(result, {
              generateTags,
              generateFilename,
            });
            console.log("[PhotoIntelligence] Resultado normalizado", {
              tagCount: intelligence.tags.length,
              hasFilename: Boolean(intelligence.filenameStem),
            });
          } catch (intelligenceError) {
            console.warn(
              "Classificação inteligente ignorada; a foto será salva normalmente:",
              intelligenceError,
            );
          }
        }

        const primaryExtension =
          captureMode === "raw"
            ? extensionForUri(originalUri || processedUri, "dng")
            : outputFormat === "heif"
              ? "heic"
              : "jpg";
        const primaryFilename = intelligence?.filenameStem
          ? buildIntelligentFilename(intelligence.filenameStem, {
              date: capturedAt,
              extension: primaryExtension,
            })
          : null;
        const komorebiMetadata = applyPhotoIntelligenceToMetadata(
          exifData?.komorebiMetadata,
          intelligence,
          primaryFilename,
        );
        const effectiveExifData = exifData
          ? { ...exifData, komorebiMetadata }
          : exifData;
        const filenameFor = (extension, suffix = null) =>
          intelligence?.filenameStem
            ? buildIntelligentFilename(intelligence.filenameStem, {
                date: capturedAt,
                extension,
                suffix,
              })
            : null;
        const shouldApplyExifBeforeSaving =
          captureMode !== "raw" && Boolean(effectiveExifData);
        const uriToSave = shouldApplyExifBeforeSaving
          ? await applyExifDataToImage(
              processedUri,
              effectiveExifData,
              originalUri,
            )
          : processedUri;
        const saveMetadataForAsset = (assetId) =>
          saveKomorebiAssetMetadata(assetId, komorebiMetadata);
        const removeStylesTemporaryFile = async (uri) => {
          if (!uri) return;
          try {
            await deletePhotographicStylesTemporaryPhoto(uri);
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
              metadata: effectiveExifData,
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
          filenameSuffix = null,
        ) => {
          let preparedUri = null;
          try {
            preparedUri = await prepareRegularPhoto(uri, metadataSourceUri);
            const asset = await saveToAlbum(
              project,
              preparedUri,
              filenameFor(
                outputFormat === "heif" ? "heic" : extensionForUri(preparedUri),
                filenameSuffix,
              ),
            );
            mainAssetSaved = true;
            if (preserveApplePhotographicStyles) {
              if (!asset?.id) {
                throw new Error(
                  "O Fotos não retornou o identificador do asset salvo",
                );
              }
              const metadataUpdated = await updatePhotoAssetMetadata(asset.id, {
                metadata: effectiveExifData,
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
          const rawAsset = await saveToAlbum(
            project,
            originalUri || processedUri,
            primaryFilename,
          );
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
            "processada",
          );
          await saveMetadataForAsset(derivedAsset?.id);
        } else if (livePhotoMovieUri) {
          const result = await saveLivePhotoToLibrary({
            photoUri: uriToSave,
            movieUri: livePhotoMovieUri,
            originalPhotoUri: originalUri,
            albumTitle: "Komorebi",
            outputFormat,
            originalFilename: primaryFilename,
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
            const inverseAsset = await saveRegularPhoto(
              inverseWithExif,
              originalUri,
              "alternativa",
            );
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
            originalFilename: primaryFilename,
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
            const inverseAsset = await saveRegularPhoto(
              inverseWithExif,
              originalUri,
              "alternativa",
            );
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
          const inverseAsset = await saveRegularPhoto(
            inverseUriWithExif,
            originalUri,
            "alternativa",
          );
          await saveMetadataForAsset(inverseAsset?.id);
        } else {
          const asset = await saveRegularPhoto(uriToSave);
          await saveMetadataForAsset(asset?.id);
        }

        if (saveOriginalWithoutEffects && originalUri) {
          const originalAsset = await saveRegularPhoto(
            originalUri,
            originalUri,
            "original",
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
    [
      activeProject,
      hasMediaPermission,
      intelligenceOptions.generateFilename,
      intelligenceOptions.generateTags,
      removeCurrentProcessing,
    ],
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
