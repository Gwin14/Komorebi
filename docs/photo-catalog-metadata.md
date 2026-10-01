# Autoria, classificação e palavras-chave

Em **Configurações → Captura e arquivos → Autoria**, autor e direitos autorais são persistidos no aparelho e incluídos nas próximas capturas. Campos vazios não adicionam autoria. As fotos existentes não são alteradas ao mudar essas preferências.

Na galeria, abra uma foto e seu painel de informações para selecionar **0–5 estrelas**. O botão com a **estrela cortada** grava explicitamente a nota zero. A miniatura mostra a classificação da biblioteca do Fotos no iOS 27 ou mais recente; nas outras plataformas, mostra a classificação lida da imagem. No catálogo do Fotos, zero significa sem classificação; miniaturas com nota zero não mostram o indicador. A interface só confirma uma mudança após a gravação; erros de permissão ou escrita são apresentados ao usuário.

Com as tags inteligentes ativadas, as palavras-chave retornadas pela análise local são gravadas nos campos padronizados e também continuam disponíveis nos detalhes internos da Komorebi. Falhas na análise não impedem a captura.

| Informação | IPTC | XMP |
| --- | --- | --- |
| Autor | By-line | dc:creator, sequência de autores |
| Direitos autorais | CopyrightNotice | dc:rights, texto alternativo x-default |
| Tags | Keywords | dc:subject, coleção sem ordem |
| Classificação | — | xmp:Rating, inteiro 0–5 |

JPEG armazena IPTC IIM em APP13 e XMP em APP1. TIFF/DNG usa os campos 33723 e 700 do IFD0. HEIF utiliza a serialização de metadados do ImageIO, com os campos XMP correspondentes. A escrita de TIFF/DNG acrescenta um novo IFD0 sem mover os dados RAW ou alterar os offsets existentes.

No iOS 27 ou mais recente, a mesma transação PhotoKit grava `PHAssetChangeRequest.rating` no catálogo do Fotos e `XMP-xmp:Rating` na imagem. A leitura usa `PHAsset.rating`, inclusive zero (sem classificação), para respeitar alterações e remoções feitas no Fotos. A galeria atualiza quando a biblioteca muda ou o app volta ao primeiro plano. Esse caminho exige compilar com o SDK do iOS 27 ou mais recente. Notas antigas gravadas apenas no XMP precisam ser selecionadas novamente no Komorebi para registrá-las no catálogo; a leitura não migra automaticamente uma nota antiga, pois isso poderia desfazer uma remoção feita no Fotos.

No iOS, PhotoKit salva a classificação na representação editada da foto e conserva o recurso original, conforme o modelo de edição do Fotos. Em RAW, a classificação fica na representação renderizada; o DNG original é preservado. Live Photos utilizam o contexto de edição de Live Photo para manter a foto e o vídeo associados. Em iOS anterior ao 17, a representação editada de HEIF usa JPEG. No Android, a classificação atualiza os metadados do JPEG pelo URI da biblioteca; o provedor precisa permitir escrita.

O helper Swift é compartilhado por links simbólicos dentro dos três módulos nativos que gravam imagens. Após mudanças nesses arquivos, execute `pod install --no-repo-update` em `ios/` e recompile o app.

## Validação

- `npm test`: testes de UTF-8, nota zero, preservação de EXIF/pixels, propriedades XMP não alteradas, TIFF nas duas ordens de bytes e entradas inválidas. Quando ExifTool está disponível, há leitura independente dos campos gravados.
- `npm run lint` e `npm run typecheck`.
- Em dispositivos físicos: capturar JPEG, HEIF, RAW, Live Photo e Retrato com autoria e tags; exportar a versão atual e conferir os metadados. Alterar notas entre 0 e 5, reiniciar o app e conferir os indicadores. Confirmar profundidade, vídeo da Live Photo, orientação e EXIF; testar acesso limitado à biblioteca e falha de escrita.

```sh
exiftool -G1 -a -s -Rating -By-line -Creator -CopyrightNotice -Rights -Keywords -Subject foto.jpg
```

A validação de PhotoKit, permissões no Android e recursos auxiliares de câmera exige dispositivos físicos; testes de arquivos e checagem de tipos não substituem essa etapa.
