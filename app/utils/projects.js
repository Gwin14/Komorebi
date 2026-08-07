import * as MediaLibrary from "expo-media-library";

// Álbum padrão do app: recebe TODAS as fotos, independente de projeto.
export const DEFAULT_ALBUM_NAME = "Komorebi";

export const createProject = (name, id) => {
  const safeId =
    id || `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: safeId,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
};

export const getProjectById = (projects, id) =>
  projects?.find((project) => project.id === id) || null;

// O álbum de um projeto leva apenas o nome do projeto (sem prefixos).
export const getProjectAlbumName = (project) => project?.name || "";

// Move um asset entre álbuns de projeto. O asset permanece no álbum padrão
// (Komorebi) em todos os casos. targetProject = null significa "nenhum
// projeto" (apenas remove do álbum de projeto de origem, se houver).
export const moveAssetToProject = async (
  assetId,
  sourceProject,
  targetProject,
) => {
  try {
    if (!assetId) return;

    const albums = await MediaLibrary.getAlbumsAsync();

    if (targetProject) {
      const targetName = getProjectAlbumName(targetProject);
      const targetAlbum =
        albums.find((album) => album.title === targetName) ||
        (await MediaLibrary.createAlbumAsync(targetName, null, false));

      await MediaLibrary.addAssetsToAlbumAsync([assetId], targetAlbum, true);
    }

    if (
      sourceProject &&
      (!targetProject || sourceProject.id !== targetProject.id)
    ) {
      const sourceName = getProjectAlbumName(sourceProject);
      const sourceAlbum = albums.find((album) => album.title === sourceName);

      if (sourceAlbum) {
        await MediaLibrary.removeAssetsFromAlbumAsync(
          [assetId],
          sourceAlbum,
          false,
        );
      }
    }
  } catch (error) {
    console.warn("Erro ao mover foto de projeto:", error);
  }
};
