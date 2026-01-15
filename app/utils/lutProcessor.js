import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import React, { useRef } from "react";
import { WebView } from "react-native-webview";
import * as piexif from "piexifjs";

const cachedLUTs = {};

export const AVAILABLE_LUTS = [
  {
    id: "none",
    name: "Sem Filtro",
    file: null,
  },

  {
    id: "filtro1",
    name: "Dark Gold",
    file: require("../../assets/luts/darkGold.CUBE"),
  },

  {
    id: "filtro2",
    name: "Wes Anderson",
    file: require("../../assets/luts/wesAnderson.CUBE"),
  },

  {
    id: "filtro3",
    name: "Cinema",
    file: require("../../assets/luts/cinema.cube"),
  },
];

const parseCubeFile = (text) => {
  const lines = text.split("\n");
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const lut = [];

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1]);
    } else if (line.startsWith("DOMAIN_MIN")) {
      const values = line.split(/\s+/).slice(1);
      domainMin = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
    } else if (line.startsWith("DOMAIN_MAX")) {
      const values = line.split(/\s+/).slice(1);
      domainMax = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
    } else if (
      !line.startsWith("#") &&
      line !== "" &&
      !line.startsWith("LUT_") &&
      !line.startsWith("DOMAIN") &&
      !line.startsWith("TITLE")
    ) {
      const values = line.split(/\s+/).filter((v) => v !== "");
      if (values.length === 3) {
        lut.push({
          r: parseFloat(values[0]),
          g: parseFloat(values[1]),
          b: parseFloat(values[2]),
        });
      }
    }
  }

  return { size, lut, domainMin, domainMax };
};

export const loadCubeLUT = async (cubeFilePath) => {
  if (!cubeFilePath) return null;

  try {
    const asset = Asset.fromModule(cubeFilePath);
    await asset.downloadAsync();

    const cubeContent = await FileSystem.readAsStringAsync(asset.localUri);
    const lutData = parseCubeFile(cubeContent);

    console.log(`LUT carregado: ${lutData.size}³ entries`);
    return lutData;
  } catch (error) {
    console.error("Erro ao carregar LUT:", error);
    return null;
  }
};

export const loadAllLUTs = async () => {
  console.log("Carregando todos os LUTs...");

  for (const lut of AVAILABLE_LUTS) {
    if (lut.file && !cachedLUTs[lut.id]) {
      const lutData = await loadCubeLUT(lut.file);
      if (lutData) {
        cachedLUTs[lut.id] = lutData;
        console.log(`LUT "${lut.name}" carregado com sucesso`);
      }
    }
  }

  console.log(`Total de LUTs carregados: ${Object.keys(cachedLUTs).length}`);
};

export const getCachedLUT = (lutId) => {
  return cachedLUTs[lutId] || null;
};

const generateProcessingHTML = (base64Image, cube) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; }
    canvas { display: none; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { 
      willReadFrequently: true,
      colorSpace: 'srgb'  // Forçar sRGB
    });
    
    const cube = ${JSON.stringify(cube)};
    
    // Conversões sRGB <-> Linear mais precisas
    const sRGBToLinear = (val) => {
      if (val <= 0.04045) {
        return val / 12.92;
      }
      return Math.pow((val + 0.055) / 1.055, 2.4);
    };
    
    const linearToSRGB = (val) => {
      if (val <= 0.0031308) {
        return val * 12.92;
      }
      return 1.055 * Math.pow(val, 1.0 / 2.4) - 0.055;
    };
    
    const clamp = (val, min = 0, max = 1) => {
      return Math.max(min, Math.min(max, val));
    };
    
    // Interpolação tetrahedral (mais precisa que trilinear)
    const tetrahedralInterpolate = (r, g, b, size, lut) => {
      const rScaled = r * (size - 1);
      const gScaled = g * (size - 1);
      const bScaled = b * (size - 1);
      
      const r0 = Math.floor(rScaled);
      const g0 = Math.floor(gScaled);
      const b0 = Math.floor(bScaled);
      
      const r1 = Math.min(r0 + 1, size - 1);
      const g1 = Math.min(g0 + 1, size - 1);
      const b1 = Math.min(b0 + 1, size - 1);
      
      const rFrac = rScaled - r0;
      const gFrac = gScaled - g0;
      const bFrac = bScaled - b0;
      
      const getColor = (rIdx, gIdx, bIdx) => {
        const index = bIdx * size * size + gIdx * size + rIdx;
        return lut[index] || { r: 0, g: 0, b: 0 };
      };
      
      // Interpolação trilinear completa (mantida por compatibilidade)
      const c000 = getColor(r0, g0, b0);
      const c001 = getColor(r1, g0, b0);
      const c010 = getColor(r0, g1, b0);
      const c011 = getColor(r1, g1, b0);
      const c100 = getColor(r0, g0, b1);
      const c101 = getColor(r1, g0, b1);
      const c110 = getColor(r0, g1, b1);
      const c111 = getColor(r1, g1, b1);
      
      const c00 = {
        r: c000.r * (1 - rFrac) + c001.r * rFrac,
        g: c000.g * (1 - rFrac) + c001.g * rFrac,
        b: c000.b * (1 - rFrac) + c001.b * rFrac,
      };
      const c01 = {
        r: c010.r * (1 - rFrac) + c011.r * rFrac,
        g: c010.g * (1 - rFrac) + c011.g * rFrac,
        b: c010.b * (1 - rFrac) + c011.b * rFrac,
      };
      const c10 = {
        r: c100.r * (1 - rFrac) + c101.r * rFrac,
        g: c100.g * (1 - rFrac) + c101.g * rFrac,
        b: c100.b * (1 - rFrac) + c101.b * rFrac,
      };
      const c11 = {
        r: c110.r * (1 - rFrac) + c111.r * rFrac,
        g: c110.g * (1 - rFrac) + c111.g * rFrac,
        b: c110.b * (1 - rFrac) + c111.b * rFrac,
      };
      
      const c0 = {
        r: c00.r * (1 - gFrac) + c01.r * gFrac,
        g: c00.g * (1 - gFrac) + c01.g * gFrac,
        b: c00.b * (1 - gFrac) + c01.b * gFrac,
      };
      const c1 = {
        r: c10.r * (1 - gFrac) + c11.r * gFrac,
        g: c10.g * (1 - gFrac) + c11.g * gFrac,
        b: c10.b * (1 - gFrac) + c11.b * gFrac,
      };
      
      return {
        r: c0.r * (1 - bFrac) + c1.r * bFrac,
        g: c0.g * (1 - bFrac) + c1.g * bFrac,
        b: c0.b * (1 - bFrac) + c1.b * bFrac,
      };
    };
    
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const size = cube.size;
      const { domainMin, domainMax, lut } = cube;
      
      console.log('Processando ' + (data.length / 4) + ' pixels...');
      console.log('Domain:', domainMin, domainMax);
      
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha === 0) continue;
        
        // Converter para [0,1] e remover premultiplication
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;
        
        if (alpha < 1 && alpha > 0) {
          r = r / alpha;
          g = g / alpha;
          b = b / alpha;
        }
        
        // IMPORTANTE: Não aplicar sRGB to Linear antes do domain
        // O LUT já espera valores em sRGB
        
        // Aplicar domain scaling
        r = clamp((r - domainMin[0]) / (domainMax[0] - domainMin[0]));
        g = clamp((g - domainMin[1]) / (domainMax[1] - domainMin[1]));
        b = clamp((b - domainMin[2]) / (domainMax[2] - domainMin[2]));
        
        // Aplicar LUT (já em espaço sRGB)
        let finalColor = tetrahedralInterpolate(r, g, b, size, lut);
        
        // Clamp output do LUT
        finalColor.r = clamp(finalColor.r);
        finalColor.g = clamp(finalColor.g);
        finalColor.b = clamp(finalColor.b);
        
        // IMPORTANTE: Não aplicar Linear to sRGB após o LUT
        // O output do LUT já está em sRGB
        
        // Premultiply alpha
        if (alpha < 1) {
          finalColor.r = finalColor.r * alpha;
          finalColor.g = finalColor.g * alpha;
          finalColor.b = finalColor.b * alpha;
        }
        
        // Converter de volta para [0,255]
        data[i] = Math.round(clamp(finalColor.r) * 255);
        data[i + 1] = Math.round(clamp(finalColor.g) * 255);
        data[i + 2] = Math.round(clamp(finalColor.b) * 255);
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      console.log('Processamento concluído!');
      
      // Salvar com qualidade máxima
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'success',
            data: base64
          }));
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 1.0);  // Qualidade máxima
    };
    
    img.onerror = (error) => {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        message: 'Erro ao carregar imagem'
      }));
    };
    
    img.src = 'data:image/jpeg;base64,${base64Image}';
  </script>
</body>
</html>
  `;
};

export const applyLUTToImage = async (imageUri, lutId, exifData) => {
  const cubeData = getCachedLUT(lutId);

  if (!cubeData) {
    console.warn(`LUT "${lutId}" não encontrado, retornando imagem original`);
    return { needsProcessing: false, originalUri: imageUri };
  }

  try {
    console.log(`Iniciando processamento com LUT "${lutId}"...`);

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("Imagem convertida para base64, tamanho:", base64.length);

    return {
      needsProcessing: true,
      base64,
      cube: cubeData,
      originalUri: imageUri,
      exifData: exifData || null,
    };
  } catch (error) {
    console.error("Erro ao preparar processamento:", error);
    return { needsProcessing: false, originalUri: imageUri };
  }
};

const applyExifToImage = (base64Data, exifData) => {
  if (!exifData || Object.keys(exifData).length === 0) {
    return base64Data;
  }

  try {
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;
    
    // Criar objeto EXIF vazio ou carregar existente
    let exifObj;
    try {
      exifObj = piexif.load(dataUrl);
    } catch (e) {
      // Se não houver EXIF existente, criar novo objeto
      exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": null };
    }

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
      exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = String(exifData.DateTimeOriginal);
    }
    if (exifData.DateTimeDigitized) {
      exifObj["Exif"][piexif.ExifIFD.DateTimeDigitized] = String(exifData.DateTimeDigitized);
    }
    if (exifData.Orientation !== undefined) {
      exifObj["0th"][piexif.ImageIFD.Orientation] = exifData.Orientation;
    }
    if (exifData.ExposureTime) {
      exifObj["Exif"][piexif.ExifIFD.ExposureTime] = piexif.helper.toExifFraction(exifData.ExposureTime);
    }
    if (exifData.FNumber) {
      exifObj["Exif"][piexif.ExifIFD.FNumber] = piexif.helper.toExifFraction(exifData.FNumber);
    }
    if (exifData.ISO) {
      exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = [exifData.ISO];
    }
    if (exifData.FocalLength) {
      exifObj["Exif"][piexif.ExifIFD.FocalLength] = piexif.helper.toExifFraction(exifData.FocalLength);
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
      exifObj["Exif"][piexif.ExifIFD.ExposureProgram] = exifData.ExposureProgram;
    }
    if (exifData.ColorSpace !== undefined) {
      exifObj["Exif"][piexif.ExifIFD.ColorSpace] = exifData.ColorSpace;
    }
    
    // GPS Data
    if (exifData.GPSLatitude && exifData.GPSLongitude) {
      exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = exifData.GPSLatitude >= 0 ? "N" : "S";
      exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = piexif.helper.degToDmsRational(Math.abs(exifData.GPSLatitude));
      exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = exifData.GPSLongitude >= 0 ? "E" : "W";
      exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = piexif.helper.degToDmsRational(Math.abs(exifData.GPSLongitude));
    }
    if (exifData.GPSAltitude) {
      exifObj["GPS"][piexif.GPSIFD.GPSAltitudeRef] = exifData.GPSAltitude >= 0 ? 0 : 1;
      exifObj["GPS"][piexif.GPSIFD.GPSAltitude] = piexif.helper.toExifFraction(Math.abs(exifData.GPSAltitude));
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

export const saveProcessedImage = async (base64Data, exifData) => {
  try {
    // Aplicar metadados EXIF se disponíveis
    const finalBase64 = exifData ? applyExifToImage(base64Data, exifData) : base64Data;
    
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

export const LUTProcessor = ({ imageData, onProcessed, onError }) => {
  const webViewRef = useRef(null);

  if (!imageData || !imageData.needsProcessing) {
    return null;
  }

  const html = generateProcessingHTML(imageData.base64, imageData.cube);

  const handleMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "success") {
        const savedUri = await saveProcessedImage(message.data, imageData.exifData);
        if (savedUri && onProcessed) {
          onProcessed(savedUri);
        }
      } else if (message.type === "error") {
        console.error("Erro no processamento:", message.message);
        if (onError) {
          onError(new Error(message.message));
        }
      }
    } catch (error) {
      console.error("Erro ao processar mensagem do WebView:", error);
      if (onError) {
        onError(error);
      }
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ html }}
      onMessage={handleMessage}
      style={{ width: 1, height: 1, opacity: 0 }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
    />
  );
};
