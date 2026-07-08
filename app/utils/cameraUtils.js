import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import * as piexif from "piexifjs";
import { Image } from "react-native";
import { captureLivePhoto } from "../../modules/camera-live-photo";
import { capturePortraitPhoto } from "../../modules/camera-portrait-capture";
import { toVisionCameraRawMode } from "../../modules/camera-raw-capture";
import { applyLUTToImage } from "./lutProcessor";

const APP_ALBUM = "Komorebi";

// Garante que a URI sempre tem o prefixo file:// (necessário no Android)
const normalizeUri = (uri) => {
  if (!uri) return uri;
  return uri.startsWith("file://") ? uri : `file://${uri}`;
};

export async function saveToAlbum(uri) {
  const fileUri = normalizeUri(uri);
  const asset = await MediaLibrary.createAssetAsync(fileUri);

  const albums = await MediaLibrary.getAlbumsAsync();
  const album = albums.find((a) => a.title === APP_ALBUM);

  if (!album) {
    await MediaLibrary.createAlbumAsync(APP_ALBUM, asset, true); // true = copyAsset
  } else {
    await MediaLibrary.addAssetsToAlbumAsync([asset], album, true); // true = copyAsset
  }
}

const getLocationExif = async (locationEnabled) => {
  const additionalExif = {};

  try {
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status !== "granted" || !locationEnabled) {
      additionalExif.removeGPS = true;
      return additionalExif;
    }

    let gpsLocation = await Location.getLastKnownPositionAsync({});
    if (!gpsLocation) {
      gpsLocation = await Location.getCurrentPositionAsync({});
    }

    if (gpsLocation) {
      additionalExif.GPSLatitude = gpsLocation.coords.latitude;
      additionalExif.GPSLongitude = gpsLocation.coords.longitude;
      additionalExif.GPSAltitude = gpsLocation.coords.altitude;
    }
  } catch (error) {
    console.log("Erro ao obter localização:", error);
    additionalExif.removeGPS = true;
  }

  return additionalExif;
};

export const takePicture = async ({
  cameraRef,
  cameraReady,
  isProcessing,
  setIsProcessing,
  selectedLutId,
  lutsLoaded,
  hasMediaPermission,
  setProcessingData,
  location,
  flash,
  doubleCaptureMode = false,
  saveOriginalWithLUT = false,
  aspectRatio = 3 / 4,
  manualSettings = null,
  rawMode = "off",
  livePhotoEnabled = false,
  livePhotoDeviceId = null,
  portraitModeEnabled = false,
  portraitDeviceId = null,
}) => {
  const normalizedRawMode = toVisionCameraRawMode(rawMode);
  const rawModeEnabled = normalizedRawMode !== "off";
  const nativeCaptureEnabled =
    (livePhotoEnabled && livePhotoDeviceId && !rawModeEnabled) ||
    (portraitModeEnabled && portraitDeviceId && !rawModeEnabled);

  if ((!nativeCaptureEnabled && !cameraRef.current) || !cameraReady || isProcessing) {
    console.warn("[CameraUtils] takePicture blocked", {
      nativeCaptureEnabled,
      hasCameraRef: Boolean(cameraRef.current),
      cameraReady,
      isProcessing,
      livePhotoEnabled,
      portraitModeEnabled,
      rawMode: normalizedRawMode,
    });
    return;
  }

  try {
    setIsProcessing(true);

    if (livePhotoEnabled && livePhotoDeviceId && !rawModeEnabled) {
      console.log("[CameraUtils] live photo capture start", {
        deviceId: livePhotoDeviceId,
        flash,
      });
      const livePhoto = await captureLivePhoto({
        deviceId: livePhotoDeviceId,
        flashMode: flash === "on" ? "on" : "off",
      });
      console.log("[CameraUtils] live photo capture result", {
        photoUri: livePhoto.photoUri,
        movieUri: livePhoto.movieUri,
        localIdentifier: livePhoto.localIdentifier,
        savedToLibrary: livePhoto.savedToLibrary,
      });
      const additionalExif = await getLocationExif(location);

      setProcessingData({
        needsProcessing: false,
        alreadySaved: true,
        originalUri: livePhoto.photoUri,
        imageUri: livePhoto.photoUri,
        livePhotoMovieUri: livePhoto.movieUri,
        localIdentifier: livePhoto.localIdentifier,
        exifData: additionalExif,
        doubleCaptureMode: false,
        saveOriginalWithLUT: false,
        aspectRatio,
        cube: null,
        grainConfig: null,
      });
      return;
    }

    if (portraitModeEnabled && portraitDeviceId && !rawModeEnabled) {
      console.log("[CameraUtils] portrait capture start", {
        deviceId: portraitDeviceId,
        flash,
      });
      const portraitPhoto = await capturePortraitPhoto({
        deviceId: portraitDeviceId,
        flashMode: flash === "on" ? "on" : "off",
      });
      console.log("[CameraUtils] portrait capture result", {
        photoUri: portraitPhoto.photoUri,
        localIdentifier: portraitPhoto.localIdentifier,
        savedToLibrary: portraitPhoto.savedToLibrary,
        depthDataEmbedded: portraitPhoto.depthDataEmbedded,
        portraitEffectsMatteEmbedded:
          portraitPhoto.portraitEffectsMatteEmbedded,
      });
      const additionalExif = await getLocationExif(location);

      setProcessingData({
        needsProcessing: false,
        alreadySaved: true,
        originalUri: portraitPhoto.photoUri,
        imageUri: portraitPhoto.photoUri,
        localIdentifier: portraitPhoto.localIdentifier,
        depthDataEmbedded: portraitPhoto.depthDataEmbedded,
        portraitEffectsMatteEmbedded:
          portraitPhoto.portraitEffectsMatteEmbedded,
        exifData: additionalExif,
        doubleCaptureMode: false,
        saveOriginalWithLUT: false,
        aspectRatio,
        cube: null,
        grainConfig: null,
      });
      return;
    }

    const additionalExif = await getLocationExif(location);
    // Com manual ativo, força "speed" (frame único, sem fusão Deep Fusion/
    // Smart HDR): em modo "quality"/"balanced" o AVCapturePhotoOutput funde
    // múltiplos frames em exposições diferentes, ignorando o ISO/obturador
    // travado manualmente e estourando a foto final em relação ao viewfinder.
    const hasManualExposure =
      manualSettings?.iso != null || manualSettings?.shutterSeconds != null;
    const photo = await cameraRef.current.takePhoto({
      flash: flash === "on" ? "on" : "off",
      rawMode: normalizedRawMode,
      photoQualityBalance: hasManualExposure ? "speed" : "quality",
    });

    // Normaliza a URI logo na origem — resolve FileSystem, ImageManipulator e MediaLibrary no Android
    const uri = normalizeUri(photo?.path || photo?.filePath || photo?.uri);

    if (rawModeEnabled) {
      setProcessingData({
        needsProcessing: false,
        originalUri: uri,
        imageUri: uri,
        exifData: additionalExif,
        doubleCaptureMode: false,
        saveOriginalWithLUT: false,
        aspectRatio,
        cube: null,
        grainConfig: null,
      });
      return;
    }

    // Reflete no EXIF os ajustes manuais (ISO/obturador/WB) realmente
    // travados no AVCaptureDevice no momento da captura, em vez de deixar a
    // foto sem essa informação (a câmera embute valores de auto exposure).
    const manualExif = {};
    if (manualSettings?.iso != null) {
      manualExif.ISO = Math.round(manualSettings.iso);
    }
    if (manualSettings?.shutterSeconds != null) {
      manualExif.ExposureTime = manualSettings.shutterSeconds;
    }
    if (manualSettings?.iso != null || manualSettings?.shutterSeconds != null) {
      manualExif.ExposureMode = 1; // 1 = manual, conforme spec EXIF
      manualExif.ExposureProgram = 1; // 1 = manual
    }
    if (manualSettings?.wbKelvin != null) {
      manualExif.WhiteBalance = 1; // 1 = manual
    }

    const completeExif = { ...additionalExif, ...manualExif, aspectRatio };

    // Item sem LUT: needsProcessing: false → a fila salva diretamente sem passar pelo WebView
    // saveOriginalWithLUT é sempre false aqui: sem LUT aplicado não há cópia "sem LUT" para salvar
    const noLutData = {
      needsProcessing: false,
      originalUri: uri,
      imageUri: uri,
      exifData: completeExif,
      doubleCaptureMode,
      saveOriginalWithLUT: false,
      aspectRatio,
      cube: null,
      grainConfig: null,
    };

    if (selectedLutId !== "none" && lutsLoaded) {
      const processingInfo = await applyLUTToImage(
        uri,
        selectedLutId,
        completeExif,
      );

      if (processingInfo.needsProcessing) {
        // Tem LUT → vai pro WebView normalmente
        setProcessingData({
          ...processingInfo,
          doubleCaptureMode,
          saveOriginalWithLUT,
          originalUri: uri,
          aspectRatio,
        });
      } else {
        // LUT não encontrado no cache → salva direto
        setProcessingData(noLutData);
      }
    } else {
      // Sem LUT selecionada → salva direto
      setProcessingData(noLutData);
    }
  } catch (error) {
    console.error("Erro ao tirar foto:", error);
  } finally {
    setIsProcessing(false);
  }
};

const getImageDimensions = (uri) =>
  new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

const getCropRect = (width, height, ratio) => {
  const currentRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;

  if (currentRatio > ratio) {
    cropWidth = Math.round(height * ratio);
  } else {
    cropHeight = Math.round(width / ratio);
  }

  return {
    originX: Math.round((width - cropWidth) / 2),
    originY: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
};

export const cropImageToAspect = async (uri, ratio) => {
  try {
    const { width, height } = await getImageDimensions(uri);
    const crop = getCropRect(width, height, ratio);

    const result = await ImageManipulator.manipulateAsync(uri, [{ crop }], {
      compress: 0.86,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return result.uri;
  } catch (error) {
    console.error("Erro ao gerar crop da imagem:", error);
    return null;
  }
};

export const cropImageToInverseAspect = async (
  uri,
  originalAspectRatio = 3 / 4,
) => {
  try {
    const inverseRatio = 1 / originalAspectRatio;
    return await cropImageToAspect(uri, inverseRatio);
  } catch (error) {
    console.error("Erro ao gerar crop inverso da imagem:", error);
    return null;
  }
};

export const onCameraReady = async (
  cameraRef,
  setPictureSize,
  setCameraReady,
) => {
  try {
    if (cameraRef.current) {
      if (setPictureSize) setPictureSize(null);
      setCameraReady(true);
    }
  } catch (e) {
    console.warn("Erro ao obter pictureSize:", e);
    setCameraReady(true);
  }
};

const toExifFraction = (val) => {
  if (val === undefined || val === null) return [0, 1];
  const tolerance = 1.0e-6;
  let h1 = 1;
  let h2 = 0;
  let k1 = 0;
  let k2 = 1;
  let b = val;
  do {
    let a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    b = 1 / (b - a);
  } while (Math.abs(val - h1 / k1) > val * tolerance);
  return [h1, k1];
};

export const applyExifDataToImage = async (imageUri, exifData) => {
  if (!exifData || Object.keys(exifData).length === 0) {
    return imageUri;
  }

  try {
    const base64Data = await FileSystem.readAsStringAsync(imageUri, {
      encoding: "base64",
    });

    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    let exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };

    try {
      const existingExif = piexif.load(dataUrl);
      if (existingExif) {
        exifObj = JSON.parse(JSON.stringify(existingExif));
        exifObj["thumbnail"] = null;
      }
    } catch (_e) {
      console.log("Criando novo objeto EXIF");
    }

    if (exifData.Make) {
      exifObj["0th"][piexif.ImageIFD.Make] = String(exifData.Make);
    }
    if (exifData.Model) {
      exifObj["0th"][piexif.ImageIFD.Model] = String(exifData.Model);
    }
    if (exifData.DateTime) {
      exifObj["0th"][piexif.ImageIFD.DateTime] = String(exifData.DateTime);
    }
    if (exifData.DateTimeOriginal) {
      exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = String(
        exifData.DateTimeOriginal,
      );
    }
    if (exifData.DateTimeDigitized) {
      exifObj["Exif"][piexif.ExifIFD.DateTimeDigitized] = String(
        exifData.DateTimeDigitized,
      );
    }

    exifObj["0th"][piexif.ImageIFD.Orientation] = 1;
    exifObj["0th"][piexif.ImageIFD.XResolution] = [72, 1];
    exifObj["0th"][piexif.ImageIFD.YResolution] = [72, 1];
    exifObj["0th"][piexif.ImageIFD.ResolutionUnit] = 2;
    exifObj["0th"][piexif.ImageIFD.Software] = "Komorebi";

    if (exifData.ExposureTime) {
      exifObj["Exif"][piexif.ExifIFD.ExposureTime] = toExifFraction(
        exifData.ExposureTime,
      );
    }
    if (exifData.FNumber) {
      exifObj["Exif"][piexif.ExifIFD.FNumber] = toExifFraction(
        exifData.FNumber,
      );
    }
    if (exifData.ISO) {
      exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = [exifData.ISO];
    }
    if (exifData.FocalLength) {
      exifObj["Exif"][piexif.ExifIFD.FocalLength] = toExifFraction(
        exifData.FocalLength,
      );
    }
    if (exifData.WhiteBalance !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.WhiteBalance] = exifData.WhiteBalance;
    }
    if (exifData.Flash !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.Flash] = exifData.Flash;
    }
    if (exifData.MeteringMode !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.MeteringMode] = exifData.MeteringMode;
    }
    if (exifData.ExposureMode !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.ExposureMode] = exifData.ExposureMode;
    }
    if (exifData.ExposureProgram !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.ExposureProgram] =
        exifData.ExposureProgram;
    }
    if (exifData.LensModel) {
      exifObj["Exif"][piexif.ExifIFD.LensModel] = String(exifData.LensModel);
    }
    if (exifData.LensMake) {
      exifObj["Exif"][piexif.ExifIFD.LensMake] = String(exifData.LensMake);
    }
    if (exifData.SubSecTimeOriginal) {
      exifObj["Exif"][piexif.ExifIFD.SubSecTimeOriginal] = String(
        exifData.SubSecTimeOriginal,
      );
    }
    if (exifData.SubSecTimeDigitized) {
      exifObj["Exif"][piexif.ExifIFD.SubSecTimeDigitized] = String(
        exifData.SubSecTimeDigitized,
      );
    }
    if (exifData.ColorSpace !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.ColorSpace] = exifData.ColorSpace;
    } else {
      exifObj["Exif"][piexif.ExifIFD.ColorSpace] = 1;
    }

    exifObj["Exif"][piexif.ExifIFD.ExifVersion] = "0230";
    exifObj["Exif"][piexif.ExifIFD.FlashpixVersion] = "0100";

    if (exifData.removeGPS) {
      exifObj["GPS"] = {};
    } else if (
      exifData.GPSLatitude !== undefined &&
      exifData.GPSLongitude !== undefined
    ) {
      exifObj["GPS"][piexif.GPSIFD.GPSVersionID] = [2, 2, 0, 0];
      exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] =
        exifData.GPSLatitude >= 0 ? "N" : "S";
      exifObj["GPS"][piexif.GPSIFD.GPSLatitude] =
        piexif.GPSHelper.degToDmsRational(Math.abs(exifData.GPSLatitude));
      exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] =
        exifData.GPSLongitude >= 0 ? "E" : "W";
      exifObj["GPS"][piexif.GPSIFD.GPSLongitude] =
        piexif.GPSHelper.degToDmsRational(Math.abs(exifData.GPSLongitude));
    }
    if (exifData.GPSAltitude !== undefined) {
      exifObj["GPS"][piexif.GPSIFD.GPSAltitudeRef] =
        exifData.GPSAltitude >= 0 ? 0 : 1;
      exifObj["GPS"][piexif.GPSIFD.GPSAltitude] = toExifFraction(
        Math.abs(exifData.GPSAltitude),
      );
    }

    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    const newBase64 = newDataUrl.split(",")[1];

    const timestamp = Date.now();
    const newFileName = FileSystem.documentDirectory + `exif_${timestamp}.jpg`;
    await FileSystem.writeAsStringAsync(newFileName, newBase64, {
      encoding: "base64",
    });

    console.log("EXIF aplicado com sucesso");
    return newFileName;
  } catch (error) {
    console.error("Erro ao aplicar EXIF:", error);
    return imageUri;
  }
};

export const copyExifFromImage = async (sourceImageUri, targetImageUri) => {
  try {
    const sourceBase64 = await FileSystem.readAsStringAsync(sourceImageUri, {
      encoding: "base64",
    });

    let sourceExifObj = null;
    try {
      sourceExifObj = piexif.load("data:image/jpeg;base64," + sourceBase64);
    } catch (_e) {
      console.log("Erro ao extrair EXIF da imagem de origem");
      return targetImageUri;
    }

    // A imagem de destino já teve os pixels reorientados pelo ImageManipulator,
    // por isso forçamos Orientation=1 para evitar dupla rotação.
    if (sourceExifObj["0th"]) {
      sourceExifObj["0th"][piexif.ImageIFD.Orientation] = 1;
    }

    const targetBase64 = await FileSystem.readAsStringAsync(targetImageUri, {
      encoding: "base64",
    });

    const targetDataUrl = `data:image/jpeg;base64,${targetBase64}`;

    const exifBytes = piexif.dump(sourceExifObj);
    const newDataUrl = piexif.insert(exifBytes, targetDataUrl);
    const newBase64 = newDataUrl.split(",")[1];

    const timestamp = Date.now();
    const newFileName = FileSystem.documentDirectory + `exif_${timestamp}.jpg`;
    await FileSystem.writeAsStringAsync(newFileName, newBase64, {
      encoding: "base64",
    });

    console.log("EXIF copiado com sucesso da primeira para segunda imagem");
    return newFileName;
  } catch (error) {
    console.error("Erro ao copiar EXIF:", error);
    return targetImageUri;
  }
};
