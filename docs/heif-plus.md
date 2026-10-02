# HEIF+

HEIF+ é uma revelação nativa do DNG com `CIRAWFilter`, seguida de efeitos
criativos, recorte e exportação HEIF. A imagem processada acompanhante da câmera
não é usada como fonte. O HEIF convencional mantém seu caminho anterior.

## Uso e compatibilidade

Em Configurações → Captura, escolha HEIF, HEIF+ ou JPEG. As preferências antigas
são migradas. HEIF+ usa o RAW selecionado quando suportado, preferindo ProRAW e
depois Bayer quando não há seleção. A disponibilidade vem do `AVCapturePhotoOutput`
da sessão configurada, após a atualização do formato. Live Photo, Retrato,
stacking e câmeras sem RAW pausam HEIF+; a preferência permanece selecionada.
A edição experimental por Estilos Apple também fica pausada.

Os controles numéricos atuam na revelação. `Automático da Apple` mantém o valor
calibrado por imagem. Recuperação de highlights é binária e requer iOS 26 e
suporte do arquivo. A interface identifica o suporte e decoder da última captura;
o módulo verifica novamente cada arquivo, independentemente da interface.
Não há preview RAW ao vivo nesta versão.

RAW 9/9DNG é selecionado explicitamente apenas quando suportado no iOS 27.
Recursos sob demanda são preparados com timeout de 15 segundos; se indisponíveis,
um decoder anterior suportado é usado. RAW 9 não expõe ajustes efetivos de
ruído cromático, detalhe ou moiré. Veja a
[apresentação da Apple sobre RAW 9](https://developer.apple.com/videos/play/wwdc2026/305/).

## Qualidade e metadados

A ordem é revelação RAW → recorte → LUT tetraédrico → halation → grain → HEIF.
Os efeitos são executados em precisão intermediária half-float; LUTs respeitam
seu domínio e os presets de halation/grain utilizam todos os parâmetros atuais.
Grain usa uma textura determinística por captura e correlação espacial em GPU;
não reproduz a sequência aleatória do Canvas. A equivalência visual dos presets
precisa ser conferida em fotos reais. Somente a máscara de halation é reduzida;
a imagem principal permanece na resolução capturada, descontando o recorte.

A exportação tenta HEIF10 em Display P3 com qualidade 0.8, preservando resolução
e profundidade de bits com compressão com perdas. O valor 1.0 pode selecionar
compressão sem perdas e gerar arquivos muito grandes. A qualidade de compressão
consta da receita; o tamanho final varia com resolução, detalhes e grain.
Se o encoder falhar,
tenta HEIF de 8-bit, exceto em erros de arquivo/armazenamento. A profundidade
verificada pelo ImageIO consta da receita. Trata-se de saída SDR; 10-bit não é
uma promessa de HDR. Cópias alternativas e sem efeitos também usam o caminho
nativo. A cópia sem efeitos mantém a mesma revelação RAW.

EXIF fotográfico, autoria, tags e receita são preservados. MakerNote e campos de
contêiner DNG não são propagados. GPS é incluído nas propriedades da imagem na
primeira exportação: a cópia sem recompressão do ImageIO não adiciona um novo
IFD GPS de maneira confiável ao HEIF. As atualizações seguintes preservam o GPS
existente; a preferência de localização desativada exclui GPS do arquivo e do
asset. ISO e campos EXIF racionais têm serialização explícita.

## Fila, background e arquivos

Cada captura preserva sua configuração, localização, efeitos, autoria, data e
projeto. Até três trabalhos ficam em Application Support, protegidos contra
limpeza de cache e excluídos de backup. Arquivos DNG são copiados sem modificar
seus bytes; a captura temporária é removida depois da cópia persistente.
A revelação e o salvamento são seriais, fora da thread principal. Consultas e
entrada de novos arquivos usam uma fila separada para não esperar a GPU.

O tempo de background concedido pelo iOS é utilizado; expiração conserva o
trabalho para retomada. Falhas oferecem tentar novamente, adiar ou descartar;
as configurações também mostram trabalhos pendentes. IDs dos assets são
registrados antes da transação PhotoKit, e a organização em álbuns tem checkpoints.
Uma retomada utiliza assets já confirmados. O DNG persistente e os HEIFs
temporários só são excluídos depois do salvamento de todas as versões.
Somente HEIFs são adicionados à biblioteca; salvar RAW junto será uma opção futura.

## Validação

- `npm run lint`: sem erros; dois avisos preexistentes de hooks.
- `npm test`: 32 testes passam, incluindo migração, políticas RAW, normalização,
  preservação em falhas e retomada de trabalhos já salvos.
- `npm run typecheck`: passa.
- Compilação Release iOS sem assinatura: passou; deployment target do app continua iOS 18.
- `bash scripts/check-heif-plus-native.sh` (macOS com acesso à GPU): verifica
  checkpoints, limite da fila, bytes RAW intactos, LUT identidade, grain
  determinístico, halation, HEIF10, EXIF, GPS e metadados sem recompressão.
- Regressão de compressão: imagem sintética com textura de 1024×1024 passou de
  1.899.192 bytes em qualidade 1.0 para 539.959 bytes em 0.8 (cerca de 72% menor),
  contra 767.698 bytes em 0.9 (a nova configuração reduziu mais 30%),
  mantendo dimensões e 10-bit. Não representa uma previsão de tamanho para fotos reais.
- ExifTool confirmou saída Display P3 com 10-bit de luminância/croma, ISO 200,
  exposição 1/100, lente, data e receita na imagem sintética de teste.

O teste nativo usa dados sintéticos para persistência, efeitos e exportação;
não substitui captura nem revelação de ProRAW em dispositivo físico. O iPhone
cadastrado estava indisponível durante a implementação. Permanecem pendentes:
regressão da captura normal/RAW/ProRAW, diferenças de cada controle em DNGs reais,
qualidade dos presets, acesso limitado ao Fotos, falhas de disco, interrupção do
processo, tempos e pico de memória em 12/24/48 MP. Esses resultados são necessários
para aceitar a qualidade e o desempenho em produção.
