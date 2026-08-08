import * as MediaLibrary from "expo-media-library";

// Álbum padrão do app: recebe TODAS as fotos, independente de projeto.
export const DEFAULT_ALBUM_NAME = "Komorebi";

// Prefixo que marca os álbuns gerenciados pelo app. Só estes aparecem
// dentro do app; o prefixo é ocultado na UI (mostramos apenas o nome).
export const PROJECT_ALBUM_PREFIX = "Komorebi - ";

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

// Nome do álbum físico na biblioteca: sempre com o prefixo do app.
export const getProjectAlbumName = (project) =>
  project?.name ? `${PROJECT_ALBUM_PREFIX}${project.name}` : "";

// Retorna o nome "limpo" (sem o prefixo) a partir do título de um álbum.
export const getProjectDisplayName = (albumTitle) =>
  albumTitle.startsWith(PROJECT_ALBUM_PREFIX)
    ? albumTitle.slice(PROJECT_ALBUM_PREFIX.length)
    : albumTitle;

// Move um asset entre álbuns de projeto. O asset permanece no álbum padrão
// (Komorebi) em todos os casos. targetProject = null significa "nenhum
// projeto" (apenas remove do álbum de projeto de origem, se houver).
export const moveAssetToProject = async (assetId, sourceProject, targetProject) => {
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

// Adiciona ou remove um asset do álbum de um projeto, preservando o álbum
// padrão (Komorebi). Usado no checklist de projetos da foto.
export const toggleAssetInProject = async (assetId, project, isMember) => {
  try {
    if (!assetId || !project) return;

    const albumName = getProjectAlbumName(project);
    const albums = await MediaLibrary.getAlbumsAsync();
    const album =
      albums.find((a) => a.title === albumName) ||
      (await MediaLibrary.createAlbumAsync(albumName, null, false));

    if (isMember) {
      await MediaLibrary.removeAssetsFromAlbumAsync(
        [assetId],
        album,
        false,
      );
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([assetId], album, true);
    }
  } catch (error) {
    console.warn("Erro ao alternar foto de projeto:", error);
  }
};

// Retorna os títulos crus dos álbuns (exceto o padrão) que contêm o asset.
// Os títulos incluem o prefixo "Komorebi - " e são comparados com
// getProjectAlbumName().
export const getAlbumNamesForAsset = async (assetId) => {
  try {
    const albums = await MediaLibrary.getAlbumsAsync();
    const result = [];

    for (const album of albums) {
      if (album.title === DEFAULT_ALBUM_NAME) continue;
      if (!album.title.startsWith(PROJECT_ALBUM_PREFIX)) continue;

      const assets = await MediaLibrary.getAssetsAsync({
        album,
        mediaType: "photo",
        first: 100,
      });
      if (assets.assets.some((a) => a.id === assetId)) {
        result.push(album.title);
      }
    }

    return result;
  } catch (error) {
    console.warn("Erro ao ler álbuns da foto:", error);
    return [];
  }
};

// Sincroniza a lista de projetos salvos com os álbuns reais da biblioteca:
// - remove projetos cujo álbum (prefixado) sumiu;
// - descobre álbuns prefixados novos e os registra com o nome limpo;
// - ignora álbuns de terceiros (sem o prefixo do app).
export const reconcileProjectsWithAlbums = async (projects) => {
  try {
    const albums = await MediaLibrary.getAlbumsAsync();
    const albumNames = new Set(albums.map((a) => a.title));
    const valid = [];

    for (const project of projects || []) {
      const name = getProjectAlbumName(project);
      if (albumNames.has(name)) {
        valid.push(project);
      }
    }

    for (const album of albums) {
      if (album.title === DEFAULT_ALBUM_NAME) continue;
      if (!album.title.startsWith(PROJECT_ALBUM_PREFIX)) continue;

      const alreadyInList = (projects || []).some(
        (p) => getProjectAlbumName(p) === album.title,
      );
      if (!alreadyInList) {
        valid.push(
          createProject(
            getProjectDisplayName(album.title),
            `project-album-${album.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`,
          ),
        );
      }
    }

    return valid;
  } catch (error) {
    console.warn("Erro ao reconciliar projetos:", error);
    return projects || [];
  }
};
