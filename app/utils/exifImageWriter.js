import * as FileSystem from "expo-file-system/legacy";
import * as piexif from "piexifjs";

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

const applyExifToImage = (base64Data, exifData, originalExifObj = null) => {
  if ((!exifData || Object.keys(exifData).length === 0) && !originalExifObj) {
    return base64Data;
  }

  try {
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    // Criar objeto EXIF vazio ou carregar existente
    let exifObj;
    if (originalExifObj) {
      exifObj = JSON.parse(JSON.stringify(originalExifObj));
      exifObj["thumbnail"] = null; // Remover thumbnail para evitar inconsistências
    } else {
      try {
        exifObj = piexif.load(dataUrl);
      } catch (_e) {
        // Se não houver EXIF existente, criar novo objeto
        exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };
      }
    }

    if (exifData) {
      // Mapear metadados EXIF do formato Expo para formato piexif
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

      // O Canvas normaliza a imagem (pixels em pé), então forçamos Orientação 1.
      // Se usarmos a orientação original, a imagem ficará girada (dupla rotação).
      exifObj["0th"][piexif.ImageIFD.Orientation] = 1;

      // Resolução padrão (necessário para alguns visualizadores reconhecerem o EXIF corretamente)
      exifObj["0th"][piexif.ImageIFD.XResolution] = [72, 1];
      exifObj["0th"][piexif.ImageIFD.YResolution] = [72, 1];
      exifObj["0th"][piexif.ImageIFD.ResolutionUnit] = 2; // Polegadas
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

      // Informações de Lente
      if (exifData.LensModel) {
        exifObj["Exif"][piexif.ExifIFD.LensModel] = String(exifData.LensModel);
      }
      if (exifData.LensMake) {
        exifObj["Exif"][piexif.ExifIFD.LensMake] = String(exifData.LensMake);
      }

      // SubSecTime para ordenação precisa
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
        exifObj["Exif"][piexif.ExifIFD.ColorSpace] = 1; // sRGB default
      }

      // Definir versão do EXIF ajuda na compatibilidade com apps de galeria
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
    }

    // Converter EXIF para bytes e inserir na imagem
    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    const newBase64 = newDataUrl.split(",")[1];

    console.log("Metadados EXIF aplicados com sucesso");
    return newBase64;
  } catch (error) {
    console.error("Erro ao aplicar EXIF:", error);
    // Retornar imagem original se houver erro
    return base64Data;
  }
};

export const saveProcessedImage = async (
  base64Data,
  exifData,
  originalExifObj,
) => {
  try {
    // Aplicar metadados EXIF se disponíveis
    const finalBase64 =
      exifData || originalExifObj
        ? applyExifToImage(base64Data, exifData, originalExifObj)
        : base64Data;

    const filename = FileSystem.documentDirectory + `lut_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(filename, finalBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("Imagem processada salva em:", filename);
    return filename;
  } catch (error) {
    console.error("Erro ao salvar imagem processada:", error);
    return null;
  }
};
