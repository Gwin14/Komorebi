import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { parseCubeFile } from "./cubeParser";
import { AVAILABLE_LUTS } from "./lutCatalog";

const cachedLUTs = {};

export const addCustomLUT = (id, name, cubeData) => {
  cachedLUTs[id] = cubeData;
};

export const removeCustomLUT = (id) => {
  if (id && cachedLUTs[id]) {
    delete cachedLUTs[id];
  }
};

export const loadCustomLUTs = async (customLuts) => {
  if (!Array.isArray(customLuts)) return;

  for (const customLut of customLuts) {
    if (!customLut || !customLut.id) continue;
    if (cachedLUTs[customLut.id]) continue;

    if (customLut.content) {
      const cubeData = parseCubeFile(customLut.content);
      if (cubeData && cubeData.size > 0) {
        cachedLUTs[customLut.id] = cubeData;
        console.log(`Custom LUT "${customLut.name}" carregado com sucesso`);
      } else {
        console.warn(`Custom LUT "${customLut.name}" não pôde ser parseado`);
      }
    }
  }
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
