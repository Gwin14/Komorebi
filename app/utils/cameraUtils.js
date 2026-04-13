import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
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
}) => {
  if (cameraRef.current && cameraReady && !isProcessing) {
    try {
      setIsProcessing(true);

      let additionalExif = {};
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted" && location) {
          let gpsLocation = await Location.getLastKnownPositionAsync({});
          if (!gpsLocation) {
            gpsLocation = await Location.getCurrentPositionAsync({});
          }
          if (gpsLocation) {
            additionalExif = {
              GPSLatitude: gpsLocation.coords.latitude,
              GPSLongitude: gpsLocation.coords.longitude,
              GPSAltitude: gpsLocation.coords.altitude,
            };
          }
        } else {
          additionalExif.removeGPS = true;
        }
      } catch (e) {
        console.log("Erro ao obter localização:", e);
        additionalExif.removeGPS = true;
      }

      const photo = await cameraRef.current.takePhoto({
        flash: flash === "on" ? "on" : "off",
      });

      const uri = photo?.path || photo?.filePath || photo?.uri;
      const completeExif = { ...additionalExif };

      if (selectedLutId !== "none" && lutsLoaded) {
        const processingInfo = await applyLUTToImage(
          uri,
          selectedLutId,
          completeExif,
        );
        processingInfo.doubleCaptureMode = doubleCaptureMode;

        if (processingInfo.needsProcessing) {
          setProcessingData(processingInfo);
          setIsProcessing(false); // Libera a UI imediatamente para nova foto
        } else {
          if (hasMediaPermission) await saveToAlbum(uri);
          setIsProcessing(false);
        }
      } else if (doubleCaptureMode) {
        setProcessingData({
          needsProcessing: false,
          originalUri: uri,
          doubleCaptureMode: true,
        });
        setIsProcessing(false);
      } else {
        if (hasMediaPermission) await saveToAlbum(uri);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Erro ao tirar foto:", error);
      setIsProcessing(false);
    }
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

export const cropImageToInverseAspect = async (uri) => {
  try {
    const { width, height } = await getImageDimensions(uri);
    const ratio = width >= height ? 3 / 4 : 4 / 3;
    return await cropImageToAspect(uri, ratio);
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
