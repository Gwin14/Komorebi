# Camera Photographic Styles

Módulo iOS experimental que gera um HEIF estruturalmente compatível com a
edição de Estilos Fotográficos no Fotos, sem aplicar um estilo visual.

O escritor de contêiner é derivado do `xdremux-core` 0.4.2, do projeto
[XDRemux-Flutter](https://github.com/BeetMan/XDRemux-Flutter), sob licença MIT
(consulte `XDREMUX_LICENSE`). O backend de codificação foi substituído por
VideoToolbox público; Komorebi não incorpora x265 nem APIs privadas da Apple.

A integração é aplicada depois de crop, LUT, grain, halation e EXIF em fotos
normais, em todos os resultados de Image Stacking, Live Photo, Retrato e HEIF+.
Apenas RAW Bayer comum suspende a compatibilidade. ProRAW aplica os estilos à
foto processada do par ou derivado, quando selecionada; o DNG permanece intacto.
HEIF+ aplica os estilos à revelação HEIF, inclusive quando usa RAW Bayer como
fonte. Nenhum DNG recebe um grafo Styles.

Live Photo e Retrato finalizam cor, catálogo e dados de captura antes de
acrescentar Styles e salvar, sem reescrever o HEIF depois. O caminho SDR para
HEIF orientado em grid preserva os bitstreams e os itens originais, incluindo
ICC, XMP, MakerNote, vínculo com vídeo e profundidade/matte. HEIF+ registra as
preferências no job e cria checkpoints duráveis das variantes com estilos;
uma retomada reutiliza esses arquivos e preserva o RAW temporário em falhas.

```ts
makePhotoStylesCompatible(photoUri, { metadata });
// Com o toggle adicional de Estilos Fotográficos 3 ativado:
makePhotoStylesCompatible(photoUri, {
  metadata,
  enableStyles3: true,
  cameraPosition: "back", // ou "front"
});
```

`metadata` aceita GPS, ISO, exposição, balanço de branco, datas e identificação
da câmera/lente. `metadataSourceUri` permite copiar o EXIF completo da captura
antes de processar os pixels. A saída só deve ser salva quando `verified` for
`true`. Após importar, `updatePhotoAssetMetadata` sincroniza localização e data
com o `PHAsset`, para que o mapa e as informações apareçam no Fotos.

O toggle **Compatibilidade com Estilos Fotográficos 3** aparece nas configurações
quando **Edição no Fotos da Apple** está ativada. Começa desligado, é persistido
separadamente e acompanha as suspensões dos estilos atuais. A opção é registrada
na captura, então alterar a configuração não modifica fotos que já estão na fila.

Com `enableStyles3`, o módulo preserva o grafo Styles existente e acrescenta um
item URI `tag:apple.com,2026:photo:metadata:texture_styles`, contendo um binary
plist com `Preset=Standard`, `CaptureType=LF`, `CaptureMode=Still`, a posição da
câmera, o perfil de renderização `HardwareModel=iPhone19,2` observado na
referência funcional, `TextureStylePeopleDataVersion=3` e
uma semente aleatória de grão por arquivo. Autor, copyright, tags e avaliação
são incorporados ao XMP HDR existente em ambos os modos. O ImageIO serializa
apenas os campos novos; o texto HDR original permanece intacto. O Rust mantém
o item em `idat` e ajusta os offsets, sem regravar o grafo pelo ImageIO.
Isso preserva o grafo dos estilos, a localização do XMP e os parâmetros HDR.
Nesse caminho, não regrave o catálogo após a conversão.

O modo 3 promove apenas a versão do plist Styles de 15 para 16 e inclui
`l=false`, preservando os demais objetos e valores dependentes da imagem.
Acrescenta as 12 máscaras auxiliares `2026:photo:aux:semantic*`, com HEVC
monocromático de 8 bits, `auxl` para imagem/tmap e um item XMP próprio com
`fsincMattes:FSINCMatteVersion=0` por máscara. São máscaras neutras, não uma
segmentação real de pessoas. Os bitstreams pré-calculados correspondem aos
recortes 4:3, 16:9 e 1:1; cada frame foi decodificado e conferido como zero.
Não se usa o encoder VideoToolbox 4:2:0 para essas máscaras monocromáticas.

`styles3Verified=true` exige o perfil Styles 16, o payload de textura dentro
de `mdat`, suas referências e todas as máscaras, propriedades e pares XMP.
O modelo real de captura permanece no EXIF; o perfil de textura segue a
referência reconhecida pelo Fotos. O modo 2 mantém o plist de versão 15. A fila
recusa o arquivo se a versão 3 foi solicitada e essa confirmação estiver ausente.
O validador identifica os estilos pelo URI de 2023, aceitando tanto o nome
`styleMetadata` quanto `metadata` e payloads em `idat` ou `mdat`. A inserção
suporta `meta` antes ou depois de `mdat`, nomes de itens do ImageIO e offsets
compostos por `base_offset + extent_offset`. Falhas de preservação dos estilos
atuais e de inserção do bloco novo produzem diagnósticos separados no log.
Isso verifica a estrutura do arquivo; o Fotos determina a disponibilidade dos
controles. A implementação não altera o HDR ou os valores MakerApple
dependentes da imagem. A comparação dos três HEICs está documentada em
`docs/photographic-styles3-comparison.md`.

A limpeza usa `FileManager` para os HEIFs temporários de estilos e conversão.
O helper aceita apenas os nomes gerados pelo app dentro da pasta temporária;
isso evita a recusa de permissão do Expo FileSystem ao remover arquivos nativos.

Para reconstruir a biblioteca nativa após alterações Rust:

```sh
bash modules/camera-photographic-styles/build-ios.sh
cd ios && pod install --no-repo-update
```

Validação local: `npm run lint`,
`node --test app/utils/photographicStyles*.test.cjs`,
`cargo test --manifest-path modules/camera-photographic-styles/rust/Cargo.toml --lib texture_styles`
e `bash scripts/check-texture-styles-native.sh`.

Validação em iPhone: comparar capturas com o toggle desligado/ligado no editor
do Fotos, testar textura e grão, câmera frontal/traseira, LUT e Image Stacking,
autor/tags, dupla captura e original sem efeitos. Confirmar também o vídeo da Live Photo, profundidade/matte do Retrato,
variantes HEIF+ com recuperação de fila e o companion HEIF de ProRAW. RAW
comum deve pausar ambas as opções e restaurá-las ao voltar a um modo compatível. O reconhecimento de textura/grão permanece experimental até esse teste.
