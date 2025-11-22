import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import React, { useRef } from "react";
import { WebView } from "react-native-webview";

let cachedCubeData = null;

// Parsear arquivo CUBE
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

// Carregar LUT
export const loadCubeLUT = async (cubeFilePath) => {
  try {
    const asset = Asset.fromModule(cubeFilePath);
    await asset.downloadAsync();

    const cubeContent = await FileSystem.readAsStringAsync(asset.localUri);
    cachedCubeData = parseCubeFile(cubeContent);

    console.log(`LUT carregado: ${cachedCubeData.size}³ entries`);
    return cachedCubeData;
  } catch (error) {
    console.error("Erro ao carregar LUT:", error);
    return null;
  }
};

// Gerar HTML para processar a imagem com LUT
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const cube = ${JSON.stringify(cube)};
    
    const sRGBToLinear = (val) => {
      if (val <= 0.04045) return val / 12.92;
      return Math.pow((val + 0.055) / 1.055, 2.4);
    };
    
    const linearToSRGB = (val) => {
      if (val <= 0.0031308) return val * 12.92;
      return 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
    };
    
    const clamp = (val, min = 0, max = 1) => {
      return Math.max(min, Math.min(max, val));
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
      
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha === 0) continue;
        
        // Unpremultiply alpha
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;
        
        if (alpha < 1 && alpha > 0) {
          r = r / alpha;
          g = g / alpha;
          b = b / alpha;
        }
        
        // Aplicar domain
        r = clamp((r - domainMin[0]) / (domainMax[0] - domainMin[0]));
        g = clamp((g - domainMin[1]) / (domainMax[1] - domainMin[1]));
        b = clamp((b - domainMin[2]) / (domainMax[2] - domainMin[2]));
        
        // Converter para linear
        r = sRGBToLinear(r);
        g = sRGBToLinear(g);
        b = sRGBToLinear(b);
        
        // Escalar para coordenadas do LUT
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
        
        // Interpolação trilinear completa
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
        
        let finalColor = {
          r: c0.r * (1 - bFrac) + c1.r * bFrac,
          g: c0.g * (1 - bFrac) + c1.g * bFrac,
          b: c0.b * (1 - bFrac) + c1.b * bFrac,
        };
        
        // Clamp LUT output
        finalColor.r = clamp(finalColor.r);
        finalColor.g = clamp(finalColor.g);
        finalColor.b = clamp(finalColor.b);
        
        // Linear to sRGB
        finalColor.r = linearToSRGB(finalColor.r);
        finalColor.g = linearToSRGB(finalColor.g);
        finalColor.b = linearToSRGB(finalColor.b);
        
        // Premultiply alpha back
        if (alpha < 1) {
          finalColor.r = finalColor.r * alpha;
          finalColor.g = finalColor.g * alpha;
          finalColor.b = finalColor.b * alpha;
        }
        
        data[i] = Math.round(clamp(finalColor.r) * 255);
        data[i + 1] = Math.round(clamp(finalColor.g) * 255);
        data[i + 2] = Math.round(clamp(finalColor.b) * 255);
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      console.log('Processamento concluído!');
      
      // Enviar resultado como base64
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
      }, 'image/jpeg', 0.95);
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

// Aplicar LUT à imagem usando WebView
export const applyLUTToImage = async (imageUri, cubeData = cachedCubeData) => {
  if (!cubeData) {
    console.warn("LUT não carregado, retornando imagem original");
    return imageUri;
  }

  try {
    console.log("Iniciando processamento com LUT...");

    // Converter imagem para base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("Imagem convertida para base64, tamanho:", base64.length);

    // Retornar dados necessários para o processamento no componente WebView
    return {
      needsProcessing: true,
      base64,
      cube: cubeData,
      originalUri: imageUri,
    };
  } catch (error) {
    console.error("Erro ao preparar processamento:", error);
    return imageUri;
  }
};

// Salvar imagem processada
export const saveProcessedImage = async (base64Data) => {
  try {
    const filename = FileSystem.documentDirectory + `lut_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(filename, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("Imagem processada salva em:", filename);
    return filename;
  } catch (error) {
    console.error("Erro ao salvar imagem processada:", error);
    return null;
  }
};

// Componente WebView para processar imagem (use isso no seu App)
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
        const savedUri = await saveProcessedImage(message.data);
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
