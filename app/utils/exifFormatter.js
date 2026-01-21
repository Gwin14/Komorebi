import * as MediaLibrary from "expo-media-library";

export const formatShutter = (seconds) => {
  if (!seconds) return null;
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
};

export const formatAperture = (f) => {
  if (!f) return null;
  return `f/${Number(f).toFixed(1)}`;
};

export const exifHandler = async (assetId, setExifData) => {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    const rawExif = info.exif;

    if (!rawExif || !rawExif["{Exif}"]) {
      setExifData(null);
      return;
    }

    const exif = rawExif["{Exif}"];
    const gps = rawExif["{GPS}"];

    const formattedExif = {
      iso: exif?.ISOSpeedRatings?.[0] ?? null,
      aperture: formatAperture(exif?.FNumber),
      shutter: formatShutter(exif?.ExposureTime),
      exposureBias:
        exif?.ExposureBiasValue !== undefined
          ? `${exif.ExposureBiasValue} EV`
          : null,
      focalLength35mm: exif?.FocalLenIn35mmFilm
        ? `${exif.FocalLenIn35mmFilm}mm`
        : null,
      lens: exif?.LensModel ?? null,
      date: exif?.DateTimeOriginal ?? null,
      latitude:
        gps?.Latitude !== undefined
          ? gps.LatitudeRef === "S"
            ? -gps.Latitude
            : gps.Latitude
          : null,
      longitude:
        gps?.Longitude !== undefined
          ? gps.LongitudeRef === "W"
            ? -gps.Longitude
            : gps.Longitude
          : null,
    };

    console.log("Formatted EXIF:", formattedExif);
    setExifData(formattedExif);
  } catch (e) {
    console.log("Erro ao ler EXIF:", e);
    setExifData(null);
  }
};
