# Camera Photographic Styles

Módulo iOS experimental que gera um HEIF estruturalmente compatível com a
edição de Estilos Fotográficos no Fotos, sem aplicar um estilo visual.

O escritor de contêiner é derivado do `xdremux-core` 0.4.2, do projeto
[XDRemux-Flutter](https://github.com/BeetMan/XDRemux-Flutter), sob licença MIT
(consulte `XDREMUX_LICENSE`). O backend de codificação foi substituído por
VideoToolbox público; Komorebi não incorpora x265 nem APIs privadas da Apple.

Esta integração é restrita a fotos normais. Live Photo, RAW, Retrato e Image
Stacking precisam de grafos auxiliares próprios e são bloqueados pela interface.
