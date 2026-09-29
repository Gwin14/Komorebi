# Camera Photographic Styles

Módulo iOS experimental que gera um HEIF estruturalmente compatível com a
edição de Estilos Fotográficos no Fotos, sem aplicar um estilo visual.

O escritor de contêiner é derivado do `xdremux-core` 0.4.2, do projeto
[XDRemux-Flutter](https://github.com/BeetMan/XDRemux-Flutter), sob licença MIT
(consulte `XDREMUX_LICENSE`). O backend de codificação foi substituído por
VideoToolbox público; Komorebi não incorpora x265 nem APIs privadas da Apple.

A integração é aplicada depois de crop, LUT, grain, halation e EXIF em fotos
normais e nos resultados de Image Stacking. Live Photo, RAW e Retrato mantêm o
pipeline próprio e pausam temporariamente a compatibilidade, sem alterar a
preferência do usuário.

```ts
makePhotoStylesCompatible(photoUri, { metadata })
```

`metadata` aceita GPS, ISO, exposição, balanço de branco, datas e identificação
da câmera/lente. `metadataSourceUri` permite copiar o EXIF completo da captura
antes de processar os pixels. A saída só deve ser salva quando `verified` for
`true`. Após importar, `updatePhotoAssetMetadata` sincroniza localização e data
com o `PHAsset`, para que o mapa e as informações apareçam no Fotos.
