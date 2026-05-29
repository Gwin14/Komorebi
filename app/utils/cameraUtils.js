import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import * as piexif from "piexifjs";
import { Image } from "react-native";
import { applyLUTToImage } from "./lutProcessor";

const APP_ALBUM = "Komorebi";

export async function saveToAlbum(uri) {
  const asset = await MediaLibrary.createAssetAsync(uri);

  let album = await MediaLibrary.getAlbumAsync(APP_ALBUM);

  if (!album) {
    await MediaLibrary.createAlbumAsync(APP_ALBUM, asset, false);
  } else {
    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
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

const createProcessingData = ({
  aspectRatio,
  doubleCaptureMode,
  exifData,
  imageUri,
  saveOriginalWithLUT,
}) => ({
  needsProcessing: true,
  imageUri,
  cube: null,
  originalUri: imageUri,
  exifData,
  grainConfig: null,
  doubleCaptureMode,
  saveOriginalWithLUT,
  aspectRatio,
});

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
}) => {
  if (!cameraRef.current || !cameraReady || isProcessing) return;

  try {
    setIsProcessing(true);

    const additionalExif = await getLocationExif(location);
    const photo = await cameraRef.current.takePhoto({
      flash: flash === "on" ? "on" : "off",
    });

    const uri = photo?.path || photo?.filePath || photo?.uri;
    const completeExif = { ...additionalExif, aspectRatio };
    const fallbackProcessingData = createProcessingData({
      aspectRatio,
      doubleCaptureMode,
      exifData: completeExif,
      imageUri: uri,
      saveOriginalWithLUT,
    });

    if (selectedLutId !== "none" && lutsLoaded) {
      const processingInfo = await applyLUTToImage(
        uri,
        selectedLutId,
        completeExif,
      );

      if (processingInfo.needsProcessing) {
        setProcessingData({
          ...processingInfo,
          doubleCaptureMode,
          saveOriginalWithLUT,
          originalUri: uri,
          aspectRatio,
        });
      } else {
        setProcessingData(fallbackProcessingData);
      }
    } else {
      setProcessingData(fallbackProcessingData);
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
      compress: 1,
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
    // Calcular o aspect ratio inverso
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
      // Vision Camera doesn't expose getAvailablePictureSizesAsync;
      // preserve pictureSize as null and mark camera ready.
      if (setPictureSize) setPictureSize(null);
      setCameraReady(true);
    }
  } catch (e) {
    console.warn("Erro ao obter pictureSize:", e);
    setCameraReady(true); // Still set ready to true
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
    // Ler imagem em base64
    const base64Data = await FileSystem.readAsStringAsync(imageUri, {
      encoding: "base64",
    });

    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    // Criar novo objeto EXIF
    let exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };

    try {
      // Tentar carregar EXIF existente
      const existingExif = piexif.load(dataUrl);
      if (existingExif) {
        exifObj = JSON.parse(JSON.stringify(existingExif));
        exifObj["thumbnail"] = null;
      }
    } catch (_e) {
      console.log("Criando novo objeto EXIF");
    }

    // Aplicar metadados
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

    // Orientação
    exifObj["0th"][piexif.ImageIFD.Orientation] = 1;
    exifObj["0th"][piexif.ImageIFD.XResolution] = [72, 1];
    exifObj["0th"][piexif.ImageIFD.YResolution] = [72, 1];
    exifObj["0th"][piexif.ImageIFD.ResolutionUnit] = 2;
    exifObj["0th"][piexif.ImageIFD.Software] = "Komorebi";

    // EXIF detalhado
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

    // GPS Data
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

    // Converter EXIF para bytes e inserir na imagem
    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    const newBase64 = newDataUrl.split(",")[1];

    // Salvar imagem com EXIF
    const timestamp = Date.now();
    const newFileName = FileSystem.documentDirectory + `exif_${timestamp}.jpg`;
    await FileSystem.writeAsStringAsync(newFileName, newBase64, {
      encoding: "base64",
    });

    console.log("EXIF aplicado com sucesso à imagem dupla");
    return newFileName;
  } catch (error) {
    console.error("Erro ao aplicar EXIF:", error);
    return imageUri;
  }
};

export const copyExifFromImage = async (sourceImageUri, targetImageUri) => {
  try {
    // Ler o EXIF da imagem de origem
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

    // Ler a imagem de destino
    const targetBase64 = await FileSystem.readAsStringAsync(targetImageUri, {
      encoding: "base64",
    });

    const targetDataUrl = `data:image/jpeg;base64,${targetBase64}`;

    // Inserir o EXIF extraído na imagem de destino
    const exifBytes = piexif.dump(sourceExifObj);
    const newDataUrl = piexif.insert(exifBytes, targetDataUrl);
    const newBase64 = newDataUrl.split(",")[1];

    // Salvar imagem com EXIF copiado
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
