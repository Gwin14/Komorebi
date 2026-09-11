import * as MediaLibrary from "expo-media-library";
import {
  readKomorebiAssetMetadata,
  readKomorebiExifMetadataFromUri,
} from "./komorebiExifMetadata";

export const formatShutter = (seconds) => {
  if (!seconds) return null;
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
};

export const formatAperture = (f) => {
  if (!f) return null;
  return `f/${Number(f).toFixed(1)}`;
};

export const formatExifDate = (value) => {
  if (value == null || value === "") return null;

  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})[:/-](\d{2})[:/-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (match) {
    const [, year, month, day, hours, minutes] = match;
    const date = `${day}/${month}/${year}`;

    return hours && minutes ? `${date} às ${hours}:${minutes}` : date;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return text;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsedDate);
};

const formatCaptureMode = (mode) => {
  const labels = {
    live: "live",
    portrait: "retrato",
    raw: "raw",
  };

  return labels[mode] || null;
};

const formatEffectBadge = (effect, label) => (effect?.enabled ? label : null);

const formatKomorebiMetadata = (metadata) => {
  if (!metadata) return {};
  const badgeParts = [
    formatCaptureMode(metadata.captureMode),
    metadata.filter?.name?.toLowerCase() || null,
    formatEffectBadge(metadata.grain, "grão"),
    formatEffectBadge(metadata.halation, "halation"),
  ].filter(Boolean);

  return badgeParts.length ? { komorebiBadges: badgeParts } : {};
};

const inferKomorebiMetadataFromAssetInfo = (info) => {
  const mediaSubtypes = info?.mediaSubtypes || [];
  const filename = info?.filename || info?.localUri || info?.uri || "";

  if (mediaSubtypes.includes("livePhoto")) {
    return { app: "Komorebi", captureMode: "live" };
  }

  if (mediaSubtypes.includes("depthEffect")) {
    return { app: "Komorebi", captureMode: "portrait" };
  }

  if (/\.(dng|raw)$/i.test(filename)) {
    return { app: "Komorebi", captureMode: "raw" };
  }

  return null;
};

export const exifHandler = async (assetId, setExifData) => {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    const rawExif = info.exif;
    const komorebiMetadata =
      (await readKomorebiExifMetadataFromUri(info.localUri || info.uri)) ||
      (await readKomorebiAssetMetadata(assetId)) ||
      inferKomorebiMetadataFromAssetInfo(info);

    if (!rawExif) {
      const komorebiExif = {
        date: formatExifDate(info.creationTime),
        ...formatKomorebiMetadata(komorebiMetadata),
      };
      setExifData(Object.keys(komorebiExif).length ? komorebiExif : null);
      return;
    }

    const exif = rawExif["{Exif}"] || rawExif;
    const gps = rawExif["{GPS}"] || rawExif;
    const tiff = rawExif["{TIFF}"] || rawExif;

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
      date: formatExifDate(
        exif?.DateTimeOriginal ??
          exif?.DateTimeDigitized ??
          exif?.DateTime ??
          tiff?.DateTime ??
          info.creationTime,
      ),
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
      ...formatKomorebiMetadata(komorebiMetadata),
    };

    console.log("Formatted EXIF:", formattedExif);
    setExifData(formattedExif);
  } catch (e) {
    console.log("Erro ao ler EXIF:", e);
    setExifData(null);
  }
};
