import { LUT_GRAIN_CONFIG } from "./lutCatalog";
import { getCachedLUT } from "./lutStore";

export const applyLUTToImage = async (imageUri, lutId, exifData) => {
  const cubeData = getCachedLUT(lutId);

  if (!cubeData) {
    console.warn(`LUT "${lutId}" não encontrado, retornando imagem original`);
    return { needsProcessing: false, originalUri: imageUri };
  }

  try {
    console.log(`Iniciando processamento com LUT "${lutId}"...`);

    // Otimização: Não lemos o base64 aqui para não bloquear a câmera.
    // Passamos o URI para ser lido pelo LUTProcessor em background.

    return {
      needsProcessing: true,
      imageUri, // Passamos o URI em vez do base64 direto
      cube: cubeData,
      originalUri: imageUri,
      exifData: exifData || null,
      grainConfig: LUT_GRAIN_CONFIG[lutId] || null,
    };
  } catch (error) {
    console.error("Erro ao preparar processamento:", error);
    return { needsProcessing: false, originalUri: imageUri };
  }
};
