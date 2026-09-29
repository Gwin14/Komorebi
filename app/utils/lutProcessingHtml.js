const HALATION_PROCESSOR_SCRIPT = `
    function applyHalation(ctx, canvas, hc) {
      const maskScale = 0.4;
      const maskWidth = Math.max(1, Math.round(canvas.width * maskScale));
      const maskHeight = Math.max(1, Math.round(canvas.height * maskScale));
      const pixelCount = maskWidth * maskHeight;

      const analysisCanvas = document.createElement('canvas');
      analysisCanvas.width = maskWidth;
      analysisCanvas.height = maskHeight;
      const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
      analysisCtx.imageSmoothingEnabled = true;
      analysisCtx.imageSmoothingQuality = 'high';
      analysisCtx.drawImage(canvas, 0, 0, maskWidth, maskHeight);
      const sourceData = analysisCtx.getImageData(0, 0, maskWidth, maskHeight).data;

      const signalMap = new Float32Array(pixelCount);
      const darknessMap = new Float32Array(pixelCount);
      const histogram = new Uint32Array(256);
      const integralWidth = maskWidth + 1;
      const lumaIntegral = new Float32Array(integralWidth * (maskHeight + 1));

      for (let y = 0; y < maskHeight; y++) {
        let rowSum = 0;
        for (let x = 0; x < maskWidth; x++) {
          const pixelIndex = y * maskWidth + x;
          const sourceIndex = pixelIndex * 4;
          const r = sourceData[sourceIndex] / 255;
          const g = sourceData[sourceIndex + 1] / 255;
          const b = sourceData[sourceIndex + 2] / 255;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const signal = luma * 0.72 + Math.max(r, g, b) * 0.28;

          signalMap[pixelIndex] = signal;
          darknessMap[pixelIndex] = Math.pow(Math.max(0, 1 - luma), 0.68);
          histogram[Math.min(255, Math.round(signal * 255))] += 1;

          rowSum += luma;
          const integralIndex = (y + 1) * integralWidth + x + 1;
          lumaIntegral[integralIndex] =
            lumaIntegral[integralIndex - integralWidth] + rowSum;
        }
      }

      // Adapt to underexposed scenes while local contrast keeps ordinary
      // midtones from becoming false light sources.
      const percentileTarget = pixelCount * 0.98;
      let accumulated = 0;
      let highPercentile = 1;
      for (let bucket = 0; bucket < histogram.length; bucket++) {
        accumulated += histogram[bucket];
        if (accumulated >= percentileTarget) {
          highPercentile = bucket / 255;
          break;
        }
      }

      const configuredFloor = Math.max(0, hc.threshold - hc.softness);
      const highlightFloor = Math.min(configuredFloor, highPercentile * 0.82);
      const contrastRadius = Math.max(2, Math.round(hc.contrastRadius * maskScale));
      const highlightMask = new Float32Array(pixelCount);

      for (let y = 0; y < maskHeight; y++) {
        for (let x = 0; x < maskWidth; x++) {
          const pixelIndex = y * maskWidth + x;
          const signal = signalMap[pixelIndex];
          const highlightPosition = Math.max(
            0,
            Math.min(1, (signal - highlightFloor) / Math.max(0.001, hc.softness)),
          );
          const highlightStrength =
            highlightPosition * highlightPosition * (3 - 2 * highlightPosition);

          const x0 = Math.max(0, x - contrastRadius);
          const y0 = Math.max(0, y - contrastRadius);
          const x1 = Math.min(maskWidth - 1, x + contrastRadius);
          const y1 = Math.min(maskHeight - 1, y + contrastRadius);
          const area = (x1 - x0 + 1) * (y1 - y0 + 1);
          const localLuma = (
            lumaIntegral[(y1 + 1) * integralWidth + x1 + 1] -
            lumaIntegral[y0 * integralWidth + x1 + 1] -
            lumaIntegral[(y1 + 1) * integralWidth + x0] +
            lumaIntegral[y0 * integralWidth + x0]
          ) / area;
          const localContrast = Math.max(0, signal - localLuma);
          const contrastPosition = Math.max(
            0,
            Math.min(
              1,
              (localContrast - hc.minContrast) /
                Math.max(0.001, hc.contrastSoftness),
            ),
          );
          const contrastStrength =
            contrastPosition * contrastPosition * (3 - 2 * contrastPosition);

          highlightMask[pixelIndex] = highlightStrength * contrastStrength;
        }
      }

      const boxBlur = (source, radius) => {
        const horizontal = new Float32Array(pixelCount);
        const output = new Float32Array(pixelCount);

        for (let y = 0; y < maskHeight; y++) {
          const rowOffset = y * maskWidth;
          let sum = 0;
          for (let x = 0; x <= Math.min(radius, maskWidth - 1); x++) {
            sum += source[rowOffset + x];
          }
          for (let x = 0; x < maskWidth; x++) {
            const left = Math.max(0, x - radius);
            const right = Math.min(maskWidth - 1, x + radius);
            horizontal[rowOffset + x] = sum / (right - left + 1);
            const removeX = x - radius;
            const addX = x + radius + 1;
            if (removeX >= 0) sum -= source[rowOffset + removeX];
            if (addX < maskWidth) sum += source[rowOffset + addX];
          }
        }

        for (let x = 0; x < maskWidth; x++) {
          let sum = 0;
          for (let y = 0; y <= Math.min(radius, maskHeight - 1); y++) {
            sum += horizontal[y * maskWidth + x];
          }
          for (let y = 0; y < maskHeight; y++) {
            const top = Math.max(0, y - radius);
            const bottom = Math.min(maskHeight - 1, y + radius);
            output[y * maskWidth + x] = sum / (bottom - top + 1);
            const removeY = y - radius;
            const addY = y + radius + 1;
            if (removeY >= 0) sum -= horizontal[removeY * maskWidth + x];
            if (addY < maskHeight) sum += horizontal[addY * maskWidth + x];
          }
        }

        return output;
      };

      const softBlur = (source, fullRadius) => {
        const passRadius = Math.max(1, Math.round(fullRadius * maskScale * 0.5));
        const firstPass = boxBlur(source, passRadius);
        return boxBlur(firstPass, passRadius);
      };

      // The custom blur is deterministic in WKWebView; relying on Canvas
      // filter here caused some iOS versions to export an empty halo layer.
      const fringeBlur = softBlur(highlightMask, hc.fringeRadius);
      const diffusionBlur = softBlur(highlightMask, hc.diffusionRadius);
      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = maskWidth;
      layerCanvas.height = maskHeight;
      const layerCtx = layerCanvas.getContext('2d');
      const layerImage = layerCtx.createImageData(maskWidth, maskHeight);
      const layerData = layerImage.data;
      let peakOpacity = 0;

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
        const sourceMask = highlightMask[pixelIndex];
        const darkness = darknessMap[pixelIndex];
        const fringe =
          Math.max(0, fringeBlur[pixelIndex] - sourceMask * 0.72) *
          darkness * hc.fringeIntensity;
        const diffusion =
          Math.max(0, diffusionBlur[pixelIndex] - sourceMask * 0.9) *
          darkness * hc.diffusionIntensity;
        peakOpacity = Math.max(peakOpacity, fringe + diffusion);
      }

      // Keep a valid edge perceptible across differently exposed captures.
      // This only raises an already detected highlight/contrast boundary.
      const opacityGain =
        peakOpacity > 0.001
          ? Math.max(1, hc.targetPeakOpacity / peakOpacity)
          : 1;

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
        const sourceMask = highlightMask[pixelIndex];
        const darkness = darknessMap[pixelIndex];

        // Subtract the source highlight so light is dispersed mostly into the
        // darker side of the edge instead of tinting the highlight itself.
        const fringe =
          Math.max(0, fringeBlur[pixelIndex] - sourceMask * 0.72) *
          darkness * hc.fringeIntensity;
        const diffusion =
          Math.max(0, diffusionBlur[pixelIndex] - sourceMask * 0.9) *
          darkness * hc.diffusionIntensity;
        const opacity = Math.min(1, (fringe + diffusion) * opacityGain);
        const dataIndex = pixelIndex * 4;

        if (opacity > 0.001) {
          layerData[dataIndex] = 255;
          layerData[dataIndex + 1] = Math.round(
            (78 * fringe + 151 * diffusion) / (fringe + diffusion),
          );
          layerData[dataIndex + 2] = Math.round(
            (30 * fringe + 74 * diffusion) / (fringe + diffusion),
          );
          layerData[dataIndex + 3] = Math.round(255 * opacity);
        }
      }

      layerCtx.putImageData(layerImage, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(layerCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
`;

const GRAIN_PROCESSOR_SCRIPT = `
    function applyGrain(ctx, canvas, gc) {
      const grainImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = grainImage.data;
      const width = canvas.width;
      const height = canvas.height;
      const resolutionScale = Math.max(width, height) / 3000;

      // A different deterministic stream is used for every processed frame.
      // Xorshift is considerably cheaper than four Box-Muller calls per pixel.
      let seed = (
        Date.now() ^
        Math.imul(width, 73856093) ^
        Math.imul(height, 19349663) ^
        Math.floor(Math.random() * 0xffffffff)
      ) >>> 0;
      if (seed === 0) seed = 0x6d2b79f5;
      const patternSeed = seed;
      const random = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 4294967296;
      };
      const triangularNoise = () =>
        (random() + random() - 1) * 2.449489743;
      const smoothstep = (edge0, edge1, value) => {
        const position = Math.max(
          0,
          Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)),
        );
        return position * position * (3 - 2 * position);
      };

      const hash2d = (x, y, offset) => {
        let hash =
          Math.imul(x + offset, 374761393) ^
          Math.imul(y - offset, 668265263) ^
          patternSeed;
        hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
        return (((hash ^ (hash >>> 16)) >>> 0) / 4294967295) * 2 - 1;
      };
      const clumpSize = Math.max(8, gc.clumpSize * resolutionScale);
      const clumpAt = (x, y) => {
        const gridX = x / clumpSize;
        const gridY = y / clumpSize;
        const x0 = Math.floor(gridX);
        const y0 = Math.floor(gridY);
        const fx = smoothstep(0, 1, gridX - x0);
        const fy = smoothstep(0, 1, gridY - y0);
        const top =
          hash2d(x0, y0, 17) * (1 - fx) +
          hash2d(x0 + 1, y0, 17) * fx;
        const bottom =
          hash2d(x0, y0 + 1, 17) * (1 - fx) +
          hash2d(x0 + 1, y0 + 1, 17) * fx;
        return top * (1 - fy) + bottom * fy;
      };

      // A small two-dimensional correlation turns isolated digital pixels
      // into organic dye-cloud clusters without smearing image detail.
      const previousLuma = new Float32Array(width);
      const previousChromaA = new Float32Array(width);
      const previousChromaB = new Float32Array(width);
      const correlation = Math.max(0, Math.min(0.45, gc.correlation));
      const neighbourWeight = correlation * 0.5;
      const rawWeight = 1 - correlation;
      const correlationGain = 1 / Math.sqrt(
        rawWeight * rawWeight + 2 * neighbourWeight * neighbourWeight,
      );

      for (let y = 0; y < height; y++) {
        let leftLuma = 0;
        let leftChromaA = 0;
        let leftChromaB = 0;

        for (let x = 0; x < width; x++) {
          const dataIndex = (y * width + x) * 4;
          const red = data[dataIndex];
          const green = data[dataIndex + 1];
          const blue = data[dataIndex + 2];
          const tone = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

          const aboveLuma = previousLuma[x];
          const aboveChromaA = previousChromaA[x];
          const aboveChromaB = previousChromaB[x];
          const lumaNoise = (
            triangularNoise() * rawWeight +
            (leftLuma + aboveLuma) * neighbourWeight
          ) * correlationGain;
          const chromaA = (
            triangularNoise() * rawWeight +
            (leftChromaA + aboveChromaA) * neighbourWeight
          ) * correlationGain;
          const chromaB = (
            triangularNoise() * rawWeight +
            (leftChromaB + aboveChromaB) * neighbourWeight
          ) * correlationGain;

          previousLuma[x] = lumaNoise;
          previousChromaA[x] = chromaA;
          previousChromaB[x] = chromaB;
          leftLuma = lumaNoise;
          leftChromaA = chromaA;
          leftChromaB = chromaB;

          // Protect deep blacks from colored crawling and roll grain gently
          // out of clipped highlights, while retaining texture in midtones.
          const toeProtection = smoothstep(0.025, 0.14, tone);
          const highlightProtection =
            1 - smoothstep(0.64, 1, tone) * gc.highlightReduction;
          const shadowResponse =
            1 + (1 - smoothstep(0.16, 0.58, tone)) * gc.shadowBoost;
          const tonalWeight =
            toeProtection * highlightProtection * shadowResponse;
          const clump = 1 + clumpAt(x, y) * gc.clumpAmount;
          const monochrome =
            lumaNoise * gc.lumaStrength * tonalWeight * clump;
          const colorStrength = gc.chromaStrength * tonalWeight;
          const colorA = chromaA * colorStrength;
          const colorB = chromaB * colorStrength;

          data[dataIndex] = Math.min(
            255,
            Math.max(0, red + monochrome + colorA),
          );
          data[dataIndex + 1] = Math.min(
            255,
            Math.max(0, green + monochrome - colorA * 0.45 + colorB * 0.2),
          );
          data[dataIndex + 2] = Math.min(
            255,
            Math.max(0, blue + monochrome + colorB),
          );
        }
      }

      ctx.putImageData(grainImage, 0, 0);
    }
`;

export const generateProcessingHTML = (
  base64Image,
  cube,
  grainConfig,
  aspectRatio = 3 / 4,
  halationConfig = null,
) => {
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
      colorSpace: 'srgb'
    });
    
    const cube = ${JSON.stringify(cube)};
    
    const sRGBToLinear = (val) => {
      if (val <= 0.04045) return val / 12.92;
      return Math.pow((val + 0.055) / 1.055, 2.4);
    };
    
    const linearToSRGB = (val) => {
      if (val <= 0.0031308) return val * 12.92;
      return 1.055 * Math.pow(val, 1.0 / 2.4) - 0.055;
    };
    
    const clamp = (val, min = 0, max = 1) => Math.max(min, Math.min(max, val));

    ${HALATION_PROCESSOR_SCRIPT}

    ${GRAIN_PROCESSOR_SCRIPT}
    
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
      // Limitar resolução máxima para evitar bitmaps absurdos em memória.
      // O crop de aspect ratio já foi feito antes de chegar aqui (cropImageToAspect),
      // então o Canvas só precisa escalar — sem recortar.
      const MAX_DIMENSION = 3000;
      let drawWidth = img.width;
      let drawHeight = img.height;

      if (drawWidth > MAX_DIMENSION || drawHeight > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(drawWidth, drawHeight);
        drawWidth = Math.round(drawWidth * scale);
        drawHeight = Math.round(drawHeight * scale);
      }

      canvas.width = drawWidth;
      canvas.height = drawHeight;
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, drawWidth, drawHeight);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Apenas processar LUT se cube for fornecido
      if (cube) {
        const size = cube.size;
        const { domainMin, domainMax, lut } = cube;
      
        console.log('Processando ' + (data.length / 4) + ' pixels...');
        console.log('Domain:', domainMin, domainMax);
      
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] / 255;
          if (alpha === 0) continue;
          
          let r = data[i] / 255;
          let g = data[i + 1] / 255;
          let b = data[i + 2] / 255;
          
          if (alpha < 1 && alpha > 0) {
            r = r / alpha;
            g = g / alpha;
            b = b / alpha;
          }
          
          // Domain scaling
          r = clamp((r - domainMin[0]) / (domainMax[0] - domainMin[0]));
          g = clamp((g - domainMin[1]) / (domainMax[1] - domainMin[1]));
          b = clamp((b - domainMin[2]) / (domainMax[2] - domainMin[2]));
          
          let finalColor = tetrahedralInterpolate(r, g, b, size, lut);
          
          finalColor.r = clamp(finalColor.r);
          finalColor.g = clamp(finalColor.g);
          finalColor.b = clamp(finalColor.b);
          
          if (alpha < 1) {
            finalColor.r = finalColor.r * alpha;
            finalColor.g = finalColor.g * alpha;
            finalColor.b = finalColor.b * alpha;
          }
          
          data[i]     = Math.round(clamp(finalColor.r) * 255);
          data[i + 1] = Math.round(clamp(finalColor.g) * 255);
          data[i + 2] = Math.round(clamp(finalColor.b) * 255);
        }
      
        ctx.putImageData(imageData, 0, 0);
      }

      // --- HALATION ---
      if (${JSON.stringify(halationConfig ? true : false)}) {
        applyHalation(ctx, canvas, ${JSON.stringify(halationConfig)});
      }
      // --- FIM HALATION ---

      // --- GRAIN ---
      if (${JSON.stringify(grainConfig ? true : false)}) {
        applyGrain(ctx, canvas, ${JSON.stringify(grainConfig)});
      }
      // --- FIM GRAIN ---
      
      console.log('Processamento concluído!');
      
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
      }, 'image/jpeg', 0.86);
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

// HTML estático com função global processImage — usado pela WebView persistente.
// Recebe payload via injectJavaScript em vez de ter dados embutidos no HTML.
export const generateRuntimeHTML = () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { margin: 0; padding: 0; } canvas { display: none; }</style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });

    const clamp = (val, min = 0, max = 1) => Math.max(min, Math.min(max, val));

    ${HALATION_PROCESSOR_SCRIPT}

    ${GRAIN_PROCESSOR_SCRIPT}

    const tetrahedralInterpolate = (r, g, b, size, lut) => {
      const rScaled = r * (size - 1);
      const gScaled = g * (size - 1);
      const bScaled = b * (size - 1);
      const r0 = Math.floor(rScaled), g0 = Math.floor(gScaled), b0 = Math.floor(bScaled);
      const r1 = Math.min(r0 + 1, size - 1), g1 = Math.min(g0 + 1, size - 1), b1 = Math.min(b0 + 1, size - 1);
      const rFrac = rScaled - r0, gFrac = gScaled - g0, bFrac = bScaled - b0;
      const getColor = (rIdx, gIdx, bIdx) => {
        const index = bIdx * size * size + gIdx * size + rIdx;
        return lut[index] || { r: 0, g: 0, b: 0 };
      };
      const c000 = getColor(r0,g0,b0), c001 = getColor(r1,g0,b0);
      const c010 = getColor(r0,g1,b0), c011 = getColor(r1,g1,b0);
      const c100 = getColor(r0,g0,b1), c101 = getColor(r1,g0,b1);
      const c110 = getColor(r0,g1,b1), c111 = getColor(r1,g1,b1);
      const lerp = (a, b, t) => ({ r: a.r*(1-t)+b.r*t, g: a.g*(1-t)+b.g*t, b: a.b*(1-t)+b.b*t });
      const c0 = lerp(lerp(c000,c001,rFrac), lerp(c010,c011,rFrac), gFrac);
      const c1 = lerp(lerp(c100,c101,rFrac), lerp(c110,c111,rFrac), gFrac);
      return lerp(c0, c1, bFrac);
    };

    function processImage({ requestId, base64, cube, halationConfig, grainConfig }) {
      const img = new Image();
      img.onerror = () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', requestId, message: 'Erro ao carregar imagem' }));
      };
      img.onload = () => {
        const MAX_DIMENSION = 3000;
        let drawWidth = img.width, drawHeight = img.height;
        if (drawWidth > MAX_DIMENSION || drawHeight > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(drawWidth, drawHeight);
          drawWidth = Math.round(drawWidth * scale);
          drawHeight = Math.round(drawHeight * scale);
        }
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, drawWidth, drawHeight);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        if (cube) {
          const { size, domainMin, domainMax, lut } = cube;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3] / 255;
            if (alpha === 0) continue;
            let r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
            if (alpha < 1) { r /= alpha; g /= alpha; b /= alpha; }
            r = clamp((r - domainMin[0]) / (domainMax[0] - domainMin[0]));
            g = clamp((g - domainMin[1]) / (domainMax[1] - domainMin[1]));
            b = clamp((b - domainMin[2]) / (domainMax[2] - domainMin[2]));
            let fc = tetrahedralInterpolate(r, g, b, size, lut);
            fc.r = clamp(fc.r); fc.g = clamp(fc.g); fc.b = clamp(fc.b);
            if (alpha < 1) { fc.r *= alpha; fc.g *= alpha; fc.b *= alpha; }
            data[i]   = Math.round(clamp(fc.r) * 255);
            data[i+1] = Math.round(clamp(fc.g) * 255);
            data[i+2] = Math.round(clamp(fc.b) * 255);
          }
          ctx.putImageData(imageData, 0, 0);
        }

        if (halationConfig) {
          applyHalation(ctx, canvas, halationConfig);
        }

        if (grainConfig) {
          applyGrain(ctx, canvas, grainConfig);
        }

        canvas.toBlob((blob) => {
          if (!blob) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', requestId, message: 'Falha ao processar imagem' }));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', requestId, data: b64 }));
          };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.86);
      };
      img.src = 'data:image/jpeg;base64,' + base64;
    }
  </script>
</body>
</html>
`;
