export const generateProcessingHTML = (
  base64Image,
  cube,
  grainConfig,
  aspectRatio = 3 / 4,
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

      // --- GRAIN ---
      if (${JSON.stringify(grainConfig ? true : false)}) {
        const gc = ${JSON.stringify(grainConfig)};

        // Box-Muller gaussiana
        function gaussian(std) {
          let u, v;
          do { u = Math.random(); } while (u === 0);
          do { v = Math.random(); } while (v === 0);
          return std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        }

        // Perlin noise
        const _p = Array.from({length:256},(_,i)=>i);
        for(let i=255;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_p[i],_p[j]]=[_p[j],_p[i]];}
        const PERM=[..._p,..._p];
        const fade=t=>t*t*t*(t*(t*6-15)+10);
        const lerp=(a,b,t)=>a+t*(b-a);
        const grad2=(h,x,y)=>((h&1)?-x:x)+((h&2)?-y:y);
        function perlin(x,y){
          const X=Math.floor(x)&255,Y=Math.floor(y)&255;
          x-=Math.floor(x);y-=Math.floor(y);
          const u=fade(x),v=fade(y);
          const a=PERM[X]+Y,b=PERM[X+1]+Y;
          return lerp(lerp(grad2(PERM[a],x,y),grad2(PERM[b],x-1,y),u),lerp(grad2(PERM[a+1],x,y-1),grad2(PERM[b+1],x-1,y-1),u),v);
        }
        function fbm(x,y,oct){
          let v=0,a=0.5,f=1,mx=0;
          for(let i=0;i<oct;i++){v+=perlin(x*f,y*f)*a;mx+=a;a*=0.5;f*=2.1;}
          return v/mx;
        }

        const grainData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const gd = grainData.data;
        const gw = canvas.width, gh = canvas.height;

        // Pré-calcular campo Perlin
        const clump = new Float32Array(gw * gh);
        for(let y=0;y<gh;y++)
          for(let x=0;x<gw;x++)
            clump[y*gw+x] = fbm(x*gc.clumpFreq, y*gc.clumpFreq, gc.octaves);

        for(let y=0;y<gh;y++){
          for(let x=0;x<gw;x++){
            const i=(y*gw+x)*4;
            const r=gd[i],g=gd[i+1],b=gd[i+2];
            const luma=0.2126*r+0.7152*g+0.0722*b;
            const t=luma/255;
            const lf=1+Math.pow(1-t,1.6)*gc.shadowBoost-Math.pow(t,2.2)*gc.highlightReduction;
            const cl=1+clump[y*gw+x]*gc.clumpAmp;
            const lumaG=gaussian(gc.lumaStd*lf*cl);
            const cr=gaussian(gc.rStd*lf);
            const cg=gaussian(gc.gStd*lf);
            const cb=gaussian(gc.bStd*lf);
            gd[i]  =Math.min(255,Math.max(0,r+lumaG+cr));
            gd[i+1]=Math.min(255,Math.max(0,g+lumaG+cg));
            gd[i+2]=Math.min(255,Math.max(0,b+lumaG+cb));
          }
        }
        ctx.putImageData(grainData, 0, 0);
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

    function processImage({ base64, cube, grainConfig }) {
      const img = new Image();
      img.onerror = () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Erro ao carregar imagem' }));
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

        if (grainConfig) {
          const gc = grainConfig;
          function gaussian(std) {
            let u, v;
            do { u = Math.random(); } while (u === 0);
            do { v = Math.random(); } while (v === 0);
            return std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
          }
          const _p = Array.from({length:256},(_,i)=>i);
          for(let i=255;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_p[i],_p[j]]=[_p[j],_p[i]];}
          const PERM=[..._p,..._p];
          const fade=t=>t*t*t*(t*(t*6-15)+10);
          const lerp=(a,b,t)=>a+t*(b-a);
          const grad2=(h,x,y)=>((h&1)?-x:x)+((h&2)?-y:y);
          function perlin(x,y){
            const X=Math.floor(x)&255,Y=Math.floor(y)&255;
            x-=Math.floor(x);y-=Math.floor(y);
            const u=fade(x),v=fade(y);
            const a=PERM[X]+Y,b=PERM[X+1]+Y;
            return lerp(lerp(grad2(PERM[a],x,y),grad2(PERM[b],x-1,y),u),lerp(grad2(PERM[a+1],x,y-1),grad2(PERM[b+1],x-1,y-1),u),v);
          }
          function fbm(x,y,oct){
            let v=0,a=0.5,f=1,mx=0;
            for(let i=0;i<oct;i++){v+=perlin(x*f,y*f)*a;mx+=a;a*=0.5;f*=2.1;}
            return v/mx;
          }
          const grainData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const gd = grainData.data;
          const gw = canvas.width, gh = canvas.height;
          const clump = new Float32Array(gw * gh);
          for(let y=0;y<gh;y++) for(let x=0;x<gw;x++) clump[y*gw+x]=fbm(x*gc.clumpFreq,y*gc.clumpFreq,gc.octaves);
          for(let y=0;y<gh;y++){
            for(let x=0;x<gw;x++){
              const i=(y*gw+x)*4;
              const r=gd[i],g=gd[i+1],b=gd[i+2];
              const luma=0.2126*r+0.7152*g+0.0722*b;
              const t=luma/255;
              const lf=1+Math.pow(1-t,1.6)*gc.shadowBoost-Math.pow(t,2.2)*gc.highlightReduction;
              const cl=1+clump[y*gw+x]*gc.clumpAmp;
              const lumaG=gaussian(gc.lumaStd*lf*cl);
              gd[i]  =Math.min(255,Math.max(0,r+lumaG+gaussian(gc.rStd*lf)));
              gd[i+1]=Math.min(255,Math.max(0,g+lumaG+gaussian(gc.gStd*lf)));
              gd[i+2]=Math.min(255,Math.max(0,b+lumaG+gaussian(gc.bStd*lf)));
            }
          }
          ctx.putImageData(grainData, 0, 0);
        }

        canvas.toBlob((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', data: b64 }));
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
