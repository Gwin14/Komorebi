import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
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
        }
      } catch (e) {
        console.log("Erro ao obter localização:", e);
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        exif: true,
        additionalExif,
      });

      const completeExif = { ...photo.exif, ...additionalExif };
      console.log(completeExif);

      if (selectedLutId !== "none" && lutsLoaded) {
        const processingInfo = await applyLUTToImage(
          photo.uri,
          selectedLutId,
          completeExif,
        );
        if (processingInfo.needsProcessing) {
          setProcessingData(processingInfo);
        } else {
          if (hasMediaPermission) await saveToAlbum(photo.uri);
          setIsProcessing(false);
        }
      } else {
        if (hasMediaPermission) await saveToAlbum(photo.uri);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Erro ao tirar foto:", error);
      setIsProcessing(false);
    }
  }
};

export const onCameraReady = async (
  cameraRef,
  setPictureSize,
  setCameraReady,
) => {
  try {
    if (cameraRef.current) {
      const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
      if (sizes && sizes.length > 0) {
        setPictureSize(sizes[0]);
      }
      setCameraReady(true);
    }
  } catch (e) {
    console.warn("Erro ao obter pictureSize:", e);
    setCameraReady(true); // Still set ready to true
  }
};
