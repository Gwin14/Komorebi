import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, DeviceEventEmitter } from "react-native";
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

import {
  writePhotoCatalogMetadata,
  deleteCatalogTemporaryPhoto,
} from "../utils/photoCatalogMetadata";

import { getProjectAlbumName } from "../utils/projects";
import { completeHeifPlusJob } from "../utils/heifPlusJobs";
import {
  listHeifPlusJobs, renderHeifPlus, enrichHeifPlus, saveHeifPlus, saveRawPhotoPair,
  discardHeifPlus, retryHeifPlus,
} from "../../modules/camera-raw-capture";

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
  const match = String(uri || "")
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]+)$/i);
  return match?.[1] || fallback;
};

export default function usePhotoProcessingQueue(
  hasMediaPermission,
  activeProject = null,
  intelligenceOptions = {},
) {
  const { onHeifPlusInspection } = intelligenceOptions;
  const [heifPlusPendingCount, setHeifPlusPendingCount] = useState(0);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const savingItemRef = useRef(null);
  const nativeJobsRef = useRef(new Set());

  const enqueueProcessing = useCallback((data) => {
    if (data.heifPlusJob) {
      if (nativeJobsRef.current.has(data.heifPlusJob.id)) return;
      nativeJobsRef.current.add(data.heifPlusJob.id);
    }
    setProcessingQueue((prev) => [...prev, data]);
    if (data.heifPlusJob) DeviceEventEmitter.emit("heifPlusJobsUpdated");
  }, []);

  const removeCurrentProcessing = useCallback(() => {
    setProcessingQueue((prev) => prev.slice(1));
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        const jobs = await listHeifPlusJobs();
        setHeifPlusPendingCount(jobs.length);
        for (const job of jobs) {
          enqueueProcessing({ captureMode: "heifPlus", needsProcessing: false, heifPlusJob: job });
        }
      } catch (error) { console.warn("Falha ao recuperar HEIF+", error); }
    };
    void restore();
    const jobsSubscription = DeviceEventEmitter.addListener("heifPlusJobsChanged", restore);
    const updates = DeviceEventEmitter.addListener("heifPlusJobsUpdated", () => {
      listHeifPlusJobs().then((jobs) => setHeifPlusPendingCount(jobs.length)).catch(console.warn);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void restore();
    });
    return () => { subscription.remove(); jobsSubscription.remove(); updates.remove(); };
  }, [enqueueProcessing]);

  const handleProcessed = useCallback(
    async (processedUri, item = {}, project = activeProject) => {
      if (savingItemRef.current === item) return;
      savingItemRef.current = item;
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
        rawPairEnabled = false,
        outputFormat = "jpeg",
        preserveApplePhotographicStyles = false,
      } = item;

      try {
        if (!hasMediaPermission) return;

        if (captureMode === "heifPlus") {
          const job = item.heifPlusJob;
          const requeue = async () => {
            try {
              await retryHeifPlus(job.id);
              nativeJobsRef.current.delete(job.id);
              enqueueProcessing({ ...item, heifPlusJob: { ...job, state: "pending" } });
            } catch (error) { Alert.alert("HEIF+", String(error.message || error)); }
          };
          const offerRecovery = (message) => Alert.alert("HEIF+ pendente", message, [
            { text: "Depois", style: "cancel" },
            { text: "Descartar", style: "destructive", onPress: async () => {
              await discardHeifPlus(job.id);
              nativeJobsRef.current.delete(job.id);
            } },
            { text: "Tentar novamente", onPress: requeue },
          ]);
          if (job.state === "failed") {
            offerRecovery(job.error || "A captura foi preservada para uma nova tentativa.");
            return;
          }
          try {
            let metadata = job.komorebiMetadata;
            await completeHeifPlusJob(job, {
              render: renderHeifPlus, save: saveHeifPlus, discard: discardHeifPlus,
              onRendered: async (rendered) => {
                onHeifPlusInspection?.(rendered.variants?.[0]?.recipe);
                const intelligence = job.intelligence || {};
                metadata = rendered.komorebiMetadata;
                if (!rendered.intelligenceCompleted && (intelligence.generateTags || intelligence.generateFilename)) {
                  try {
                    const result = normalizePhotoIntelligence(await withTimeout(analyzePhoto({
                      imageUri: rendered.variants[0].photoUri, ...intelligence,
                    }), PHOTO_INTELLIGENCE_TIMEOUT_MS), intelligence);
                    const filename = result.filenameStem ? buildIntelligentFilename(result.filenameStem, {
                      date: new Date(job.createdAt), extension: "heic",
                    }) : null;
                    const enrichedMetadata = applyPhotoIntelligenceToMetadata(metadata, result, filename);
                    await enrichHeifPlus(job.id, {
                      komorebiMetadata: enrichedMetadata,
                      catalogMetadata: { ...job.catalogMetadata, tags: result.tags },
                      ...(filename ? { filename } : {}),
                    });
                    metadata = enrichedMetadata;
                  } catch (error) { console.warn("Classificação HEIF+ ignorada", error); }
                }
              },
              onSaved: async (saved) => {
                for (const variant of saved.variants || []) {
                  await saveKomorebiAssetMetadata(variant.assetId, {
                    ...(saved.komorebiMetadata || metadata), app: "Komorebi", captureMode: "heifPlus", schemaVersion: 5,
                    heifPlus: variant.recipe,
                    ...(variant.name === "original" ? {
                      filter: null, grain: { enabled: false, id: "none" }, halation: { enabled: false, id: "none" },
                    } : {}),
                  });
                }
              },
            });
            nativeJobsRef.current.delete(job.id);
            DeviceEventEmitter.emit("heifPlusJobsUpdated");
          } catch (error) {
            offerRecovery(`${error.message || error}\nO RAW temporário permanece intacto.`);
          }
          return;
        }

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
        const catalogMetadata = Object.fromEntries(
          Object.entries({
            author: intelligenceOptions.author?.trim() || undefined,
            copyright: intelligenceOptions.copyright?.trim() || undefined,
            tags: intelligence?.tags?.length ? intelligence.tags : undefined,
          }).filter(([, value]) => value !== undefined),
        );
        const effectiveExifData = { ...exifData, komorebiMetadata, catalogMetadata };
        const filenameFor = (extension, suffix = null) =>
          intelligence?.filenameStem
            ? buildIntelligentFilename(intelligence.filenameStem, {
                date: capturedAt,
                extension,
                suffix,
              })
            : null;
        const shouldApplyExifBeforeSaving =
          captureMode !== "raw" && Boolean(exifData);
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
        const prepareRegularPhoto = async (
          uri,
          metadataSourceUri = originalUri,
        ) => {
          if (preserveApplePhotographicStyles) {
            const result = await makePhotoStylesCompatible(uri, {
              metadata: effectiveExifData,
              metadataSourceUri,
            });
            if (!result?.verified || !result?.photoUri) {
              await removeStylesTemporaryFile(result?.photoUri);
              throw new Error(
                "O HEIF gerado não passou na validação dos Estilos Fotográficos",
              );
            }
            return result.photoUri;
          }

          try {
            return await convertPhotoFormat({
              photoUri: uri,
              metadataSourceUri,
              metadata: effectiveExifData,
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
            const catalogUri = await writePhotoCatalogMetadata(preparedUri, catalogMetadata);
            let asset;
            try {
              asset = await saveToAlbum(
                project,
                catalogUri,
                filenameFor(
                  outputFormat === "heif" ? "heic" : extensionForUri(preparedUri),
                  filenameSuffix,
                ),
              );
            } finally {
              if (catalogUri !== preparedUri) await deleteCatalogTemporaryPhoto(catalogUri);
            }
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
          const rawUri = originalUri || processedUri;
          const catalogRawUri = await writePhotoCatalogMetadata(rawUri, catalogMetadata);
          let rawAsset;
          try {
            if (rawPairEnabled) {
              if (!derivativeSourceUri) throw new Error("Foto processada da captura RAW não foi retornada");
              let pairProcessedUri = derivativeSourceUri;
              let croppedUri;
              let catalogProcessedUri;
              let convertedUri;
              let croppedWithExifUri;
              try {
                if (Math.abs(Math.min(aspectRatio, 1 / aspectRatio) - 3 / 4) >= 0.01) {
                  croppedUri = await cropImageToAspect(derivativeSourceUri, aspectRatio);
                  if (!croppedUri) throw new Error("Falha ao recortar a foto processada do RAW");
                  croppedWithExifUri = await copyExifFromImage(derivativeSourceUri, croppedUri);
                  pairProcessedUri = croppedWithExifUri;
                }
                const expectedExtension = outputFormat === "heif" ? /\.hei[cf]$/i : /\.jpe?g$/i;
                if (!expectedExtension.test(pairProcessedUri)) {
                  convertedUri = await convertPhotoFormat({
                    photoUri: pairProcessedUri, metadataSourceUri: derivativeSourceUri,
                    metadata: effectiveExifData, outputFormat,
                  });
                  pairProcessedUri = convertedUri;
                  if (!expectedExtension.test(pairProcessedUri)) {
                    throw new Error("A foto processada do RAW não foi convertida para o formato selecionado");
                  }
                }
                catalogProcessedUri = await writePhotoCatalogMetadata(pairProcessedUri, catalogMetadata);
                rawAsset = await saveRawPhotoPair(catalogRawUri, catalogProcessedUri, {
                  projectAlbum: project ? getProjectAlbumName(project) : null,
                  originalFilename: primaryFilename,
                  metadata: { ...effectiveExifData,
                    createdAt: exifData?.komorebiMetadata?.createdAt || capturedAt.toISOString() },
                });
                console.log("[Komorebi RAW pair]", JSON.stringify(rawAsset.rawPair));
              } finally {
                if (catalogProcessedUri !== pairProcessedUri) await deleteCatalogTemporaryPhoto(catalogProcessedUri);
                for (const temporaryUri of new Set([croppedUri, croppedWithExifUri, convertedUri])) {
                  if (temporaryUri && temporaryUri !== derivativeSourceUri) {
                    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(console.warn);
                  }
                }
              }
            } else {
              rawAsset = await saveToAlbum(project, catalogRawUri, primaryFilename);
            }
          } finally {
            if (catalogRawUri !== rawUri) await deleteCatalogTemporaryPhoto(catalogRawUri);
          }
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
            metadata: effectiveExifData,
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
            metadata: effectiveExifData,
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
        if (captureMode === "heifPlus") {
          nativeJobsRef.current.delete(item.heifPlusJob.id);
          DeviceEventEmitter.emit("heifPlusJobsUpdated");
        }
        if (captureMode !== "heifPlus" || hasMediaPermission) removeCurrentProcessing();
        else savingItemRef.current = null;
        setGalleryRefreshKey((value) => value + 1);
      }
    },
    [
      activeProject,
      enqueueProcessing,
      hasMediaPermission,
      onHeifPlusInspection,
      intelligenceOptions.author,
      intelligenceOptions.copyright,
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
    heifPlusPendingCount,
    galleryRefreshKey,
    handleProcessed,
    isProcessing,
    processingQueue,
    removeCurrentProcessing,
    setIsProcessing,
  };
}
