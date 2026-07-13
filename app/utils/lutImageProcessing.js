import { getCachedLUT } from "./lutStore";

export const applyLUTToImage = async (
  imageUri,
  lutId,
  grainConfig,
  exifData,
) => {
  const cubeData = lutId && lutId !== "none" ? getCachedLUT(lutId) : null;

  if (lutId && lutId !== "none" && !cubeData) {
    console.warn(`LUT "${lutId}" não encontrado, retornando imagem original`);
  }

  if (!cubeData && !grainConfig) {
    return { needsProcessing: false, originalUri: imageUri };
  }

  try {
    console.log("Iniciando processamento de efeitos da foto...");

    // Otimização: Não lemos o base64 aqui para não bloquear a câmera.
    // Passamos o URI para ser lido pelo LUTProcessor em background.

    return {
      needsProcessing: true,
      imageUri, // Passamos o URI em vez do base64 direto
      cube: cubeData || null,
      originalUri: imageUri,
      exifData: exifData || null,
      grainConfig: grainConfig || null,
    };
  } catch (error) {
    console.error("Erro ao preparar processamento:", error);
    return { needsProcessing: false, originalUri: imageUri };
  }
};
