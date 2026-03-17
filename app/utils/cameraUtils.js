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
  flash,
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
        if (processingInfo.needsProcessing) {
          setProcessingData(processingInfo);
          setIsProcessing(false); // Libera a UI imediatamente para nova foto
        } else {
          if (hasMediaPermission) await saveToAlbum(uri);
          setIsProcessing(false);
        }
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
