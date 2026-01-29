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

    if (!rawExif) {
      setExifData(null);
      return;
    }

    const exif = rawExif["{Exif}"] || rawExif;
    const gps = rawExif["{GPS}"] || rawExif;

    const formattedExif = {
      iso: exif?.ISOSpeedRatings?.[0] ?? exif?.ISOSpeedRatings ?? null,
      aperture: formatAperture(exif?.FNumber),
      shutter: formatShutter(exif?.ExposureTime),
      exposureBias:
        exif?.ExposureBiasValue != null
          ? `${parseFloat(exif.ExposureBiasValue).toFixed(1)} EV`
          : null,
      focalLength35mm: exif?.FocalLenIn35mmFilm
        ? `${exif.FocalLenIn35mmFilm}mm`
        : null,
      lens: exif?.LensModel ?? null,
      date: exif?.DateTimeOriginal ?? exif?.DateTime ?? null,
      latitude:
        gps?.Latitude !== undefined
          ? gps.LatitudeRef === "S"
            ? -gps.Latitude
            : gps.Latitude
          : gps?.GPSLatitude !== undefined
            ? gps.GPSLatitudeRef === "S" || gps.GPSLatitude < 0
              ? -Math.abs(gps.GPSLatitude)
              : Math.abs(gps.GPSLatitude)
            : null,
      longitude:
        gps?.Longitude !== undefined
          ? gps.LongitudeRef === "W"
            ? -gps.Longitude
            : gps.Longitude
          : gps?.GPSLongitude !== undefined
            ? gps.GPSLongitudeRef === "W" || gps.GPSLongitude < 0
              ? -Math.abs(gps.GPSLongitude)
              : Math.abs(gps.GPSLongitude)
            : null,
    };

    console.log("Formatted EXIF:", formattedExif);
    setExifData(formattedExif);
  } catch (e) {
    console.log("Erro ao ler EXIF:", e);
    setExifData(null);
  }
};
