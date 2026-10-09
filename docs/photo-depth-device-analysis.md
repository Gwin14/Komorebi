# Análise dos arquivos de profundidade no iPhone

## Objetivo atual: botão de Retrato fora do editor — 8 de outubro

O usuário delimitou o objetivo ao controle que aparece ao abrir a foto no Fotos
e permite ligar/desligar o desfoque, sem entrar em Editar. O sucesso do editor
na variante X não satisfaz esse requisito.

A revisão do encoder e uma execução nativa confirmaram `PhotosAppFeatureFlags = 1`
após geração, mesclagem XMP e avaliação nas oito orientações JPEG. A reprodução
HEIC `fusion-generated.heic` também conserva a flag. ImageIO consegue criar essa
MakerNote mesmo em imagens sem MakerNotes anteriores. Portanto, perda dessa
flag nessas etapas não foi reproduzida. Foi acrescentada uma asserção à suíte
para conservar essa verificação. Isso não comprova a classificação do asset pelo
PhotoKit nem a presença do botão.

Foram preparadas em `/private/tmp/komorebi-portrait-button/` três cópias da
reprodução colorida No Fusion com profundidade do encoder atual:

| Arquivo | Diferença em relação ao controle |
| --- | --- |
| `01-controle.heic` | Nenhuma; saída atual, sem edição do Fotos |
| `02-marcador-retrato.heic` | Somente EXIF CustomRendered = 8 (Portrait no ExifTool) |
| `03-tipo-retrato.heic` | Somente Apple ImageCaptureType = 2 (Portrait) |

Todas conservam PhotosAppFeatureFlags = 1. A decodificação ImageIO e SHA-256
confirmaram identidade dos pixels principais, amostras de disparidade, HDR e
XMP de ambos os auxiliares. Os arquivos foram alterados com ExifTool; não são
uma mudança de produção. O script temporário `verify.swift` registra a comparação.

Esse teste usa a estrutura completa atual, ao contrário de A/C, anteriores à
correção de geometria/receita, e separa os marcadores em vez de alterá-los juntos.
CustomRendered = 8 é apenas uma hipótese de reconhecimento: os pixels dessas
cópias continuam sem desfoque aplicado. Não adotá-lo como representação final
sem avaliar também a coerência entre estado ligado/desligado e aparência.

### Resultado das três cópias informado pelo usuário

Todas permitem aplicar e regular o desfoque em Editar. Somente 02 apresenta o
ícone desde a importação, sempre ativo e sem opção de desligar. Em 01/03 e numa
nova captura Komorebi com profundidade, aplicar desfoque no editor faz o ícone
aparecer; desligar o efeito no editor faz o ícone desaparecer. Em 02 o ícone
permanece mesmo depois de desligar o efeito no editor, ainda sem opção de
alternância. Logo, CustomRendered=8 resolve apenas a indicação persistente de
retrato já aplicado. Não satisfaz o controle reversível solicitado.

### Marcador de fonte com profundidade sem efeito aplicado

Diagnósticos locais, somente de leitura e fora do app, carregaram os componentes
PhotoFoundation/PhotoImaging do macOS 27 e examinaram a classificação das cópias.
`PFMetadata` reconhece 01/03 como `isPortrait=false`, `isSDOF=false`,
`hasDepthDataAndIsNotRenderedSDOF=false`; 02 como `isPortrait=true`, `isSDOF=true`,
`hasDepthDataAndIsNotRenderedSDOF=false`. Isso reproduz uma distinção compatível
com o comportamento relatado no iPhone, mas não equivale ao teste da interface.

O campo Apple `ImageProcessingFlags` (MakerNote 0x0019, chave ImageIO `"25"`)
vale 2 no controle. Acrescentar **apenas 0x20**, conservando os bits anteriores,
produz `isPortrait=true`, `isSDOF=false`,
`hasDepthDataAndIsNotRenderedSDOF=true`. O marcador adjacente 0x40 também muda a
última classificação, mas `PIPortraitAutoCalculator` rejeita a configuração com
`NUError Code=2 (Invalid) Portrait was previously applied.` Portanto os dois
bits não são intercambiáveis. Com 0x20, `portraitSettingsWithExifProperties`
continua permitindo abertura/foco e retorna configurações sem erro.

O encoder agora acrescenta 0x20 às flags de processamento, preservando os outros
bits e os metadados existentes. Não passa a escrever CustomRendered=8 nem 0x40.
Nenhuma chamada a APIs privadas foi acrescentada ao aplicativo; essas chamadas
existem somente nos diagnósticos temporários do macOS:
`/private/tmp/portrait-classify.m`, `portrait-flags.m` e `portrait-settings.m`.
A suíte nativa verifica a persistência do marcador após XMP e avaliação, assim
como a preservação das flags anteriores. O commit registra processingFlags e
photoDepthEffect antes/depois, para distinguir reconhecimento do arquivo de
classificação do asset existente pelo PhotoKit.

Essa verificação também reproduziu uma perda de marcadores durante o merge
final: com MakerNotes anteriores 25=131074 / 31=4, a primeira gravação produzia
25=131106 / 31=5, mas mesclar o `CGImageMetadata` da fonte restaurava os valores
anteriores. O objeto conserva metadados nativos não expostos como tags XMP.
O encoder agora serializa as tags XMP pretendidas e cria um novo objeto somente
com esse XMP para mesclar, conservando a MakerNote já atualizada no arquivo.
Isso preserva as regiões Face da fonte, que não sobrevivem a simplesmente
trocar a base de metadados pela imagem reconstruída. A saída final também é
verificada quanto à presença do mapa e de 0x20 antes de ser entregue ao PhotoKit.

Nova amostra: `/private/tmp/komorebi-portrait-button/04-profundidade-reversivel.heic`.
Ela altera somente ImageProcessingFlags de 2 para 34 no controle 01. SHA-256
dos pixels decodificados, disparidade, HDR e XMP dos auxiliares são idênticos
aos de 01/02/03. Os diagnósticos confirmam a nova classificação também ao ler
essa amostra real. O nome do arquivo descreve a hipótese; o botão reversível
continua pendente de validação no Fotos do iPhone.

Pendente: abrir 04 no Fotos, antes de Editar, e verificar se o controle permite
ligar **e** desligar o efeito, além de testar uma nova geração pelo aplicativo
recompilado no asset existente. Não considerar o objetivo atingido somente por
aparecer o ícone ou pelos resultados do macOS. `validated` permanece false.

Após corrigir a mesclagem, foi gerada **05-encoder-corrigido.heic** pelo encoder
completo atualizado, desde a foto No Fusion sem profundidade. Ela está na mesma
pasta de 04 e apresenta processingFlags=34, featureFlags=1, CustomRendered=1;
o diagnóstico local confirma `isPortrait=true`, `isSDOF=false`,
`hasDepthDataAndIsNotRenderedSDOF=true`. Os cinco hashes de pixels, profundidade,
HDR e XMP auxiliar coincidem com 01–04. Esta é a amostra preferencial para o
próximo teste, pois reproduz o caminho real do encoder. Passaram lint, typecheck
Swift com SDK iOS (target iOS 17), suíte nativa completa e `git diff --check`.
Não foi compilado/instalado o aplicativo completo nem observado o botão no iPhone.

### Retorno da amostra corrigida no iPhone

O usuário confirmou posteriormente que 05-encoder-corrigido.heic importada
funciona perfeitamente, incluindo a alternância. A geração no asset existente
pelo app mostra o ícone ativo, sem opção de desligar. O arquivo gerado funciona
como original importado; sua aplicação como PHContentEditingOutput mantém um
original sem profundidade e não reproduz esse comportamento no visualizador.

O salvamento passou a criar um novo asset com o arquivo gerado como recurso
`.photo`, preservando a foto de origem. Data, localização, favorito, visibilidade,
classificação e álbuns comuns que aceitam adição são copiados na mesma transação.
A galeria seleciona a cópia após recarregar. As edições antigas continuam podendo
ser revertidas; **Salvar cópia para Retrato** regenera a partir do backup anterior,
sem apagar o asset antigo ou seus dados de recuperação. Edições externas sem o
marcador esperado continuam bloqueadas para impedir copiar desfoque já aplicado.

Após a mudança de salvamento, o usuário confirmou em 8 de outubro de 2026:
"perfeito, funcionou perfeitamente". Isso confirma o objetivo desta etapa no
iPhone: a cópia gerada pelo app permite ligar/desligar o desfoque pelo ícone
do Fotos fora de Editar, assim como a amostra 05 importada. Modelo do dispositivo
e versão do iOS não foram informados. `validated` permanece false enquanto a
matriz mais ampla de formatos, metadados, permissões e recuperação não estiver
concluída; isso não invalida o sucesso confirmado desse fluxo.

Verificação desta mudança: lint sem avisos, typecheck TypeScript, typecheck
Swift com SDK iOS/target iOS 17, suíte nativa e sete testes existentes da galeria
aprovados; `git diff --check` limpo. Não foi compilado/instalado o app completo.

Em 7 de outubro de 2026, o usuário gerou profundidade no Komorebi e relatou que o Fotos não ofereceu edição de desfoque. A geração permanece habilitada por solicitação do usuário; a compatibilidade com o editor do Fotos não está validada.

O primeiro ZIP continha o original não modificado da foto processada. A ausência de disparidade nesse original é esperada e não indica perda durante a edição. O arquivo posterior `0.heic`, compartilhado para analisar o resultado, contém disparidade.

Comparação com ExifTool 13.55:

| Campo | Resultado do Komorebi (`0.heic`) | Referência nativa (`IMG_8111.HEIC`) |
| --- | --- | --- |
| Auxiliar de disparidade | Presente, `urn:mpeg:hevc:2015:auxid:2` | Presente, mesmo identificador |
| Formato nativo / armazenamento | `hdis` / `L008` | `hdis` / `L008` |
| Accuracy | relative | relative |
| Quality | low | high |
| Filtered | False | True |
| PortraitScore / PortraitScoreIsHigh | 0 / False | Ausentes na extração |
| PhotosAppFeatureFlags | 0 | 1 |
| ImageCaptureType | ProRAW | Scene |
| Calibração intrínseca / distorção | Ausente na extração | Presente |
| Intervalo de disparidade | Aproximadamente 0,01–1 | Aproximadamente 0,758–5,590 |

Os campos de captura herdados não mudam o formato do arquivo: o resultado é HEIC, mesmo com o MakerNote `ImageCaptureType` identificado como ProRAW. Os intervalos diferem porque o modelo gera disparidade normalizada; não são distâncias físicas medidas.

Conclusão confirmada: a geração e a exportação incorporam disparidade, mas o teste relatado no iPhone não habilita o editor de desfoque do Fotos. Não foi demonstrado que alterar qualquer um dos campos acima resolve isso. Não copiar calibração ou indicadores de qualidade da foto de referência: seriam informações de outra captura, sem correspondência com a estimativa.

O usuário também compartilhou a foto pelo Komorebi e escolheu Salvar; a nova cópia igualmente não ofereceu edição de desfoque. Portanto o problema não está restrito à edição no asset existente. A documentação de captura da Apple descreve reconhecimento de arquivos com profundidade capturada, mas não garante conversão de um asset existente em retrato por uma edição com profundidade sintética.

## Parâmetros de renderização e experimento

A referência nativa contém `depthBlurEffect:RenderingParameters`, um bloco binário com assinatura REND, e `depthBlurEffect:SimulatedAperture = 2.8` nos metadados do auxiliar de disparidade. Ambos estão ausentes em `0.heic`. A implementação atual cria AVDepthData apenas com os valores e a descrição do mapa; não cria essa receita de desfoque.

A [implementação pública XDRemux](https://github.com/BeetMan/XDRemux-Flutter/blob/main/docs/modules/portrait-pipeline.md) relata suporte ao editor do Fotos usando uma estrutura de retrato com REND e outros recursos. O autor relata que alterar PortraitScore não resolveu ativação padrão. Isso é evidência de outra implementação, não validação do Komorebi. O código também usa calibração específica de seu produtor e parâmetros dinâmicos por foto; não pode ser transplantado como solução geral para Depth Anything.

Foram preparadas três cópias temporárias para importação manual no iPhone: A muda ImageCaptureType para Portrait e CustomRendered para 9; B incorpora somente os dois campos depthBlurEffect da referência; C combina A e B. São hipóteses controladas, sem alterações no app ou no arquivo original. Não copiam calibração, qualidade, filtragem ou pontuação de retrato. O significado de CustomRendered 9 não é validado pela documentação pública da Apple.

B e C passam pela reconstrução ImageIO, que pode recomprimir a imagem principal. O mapa conserva geometria de 768 × 1024 e orientação 1; a diferença máxima observada nos valores Float16 após recodificação é 0,015380859. Os parâmetros REND pertencem à cena de referência: o teste só investiga reconhecimento, não foco ou intensidade corretos.

O usuário importou as três variantes e informou que nenhuma habilitou edição de profundidade no Fotos. Logo, essas mudanças isoladas não são uma correção. Nenhuma delas foi incorporada ao fluxo de geração do app. A geração continua habilitada por solicitação do usuário, com texto informando o resultado negativo em vez de uma compatibilidade apenas pendente.

Na implementação de referência, a validação do próprio produtor exige, além de REND, ganho HDR, matte de retrato e segmentações de pele, cabelo, dentes e óculos. Sua estrutura inclui MakerNotes e parâmetros dependentes da cena e do produtor. Essas exigências pertencem àquela implementação; não demonstram que o Fotos exige todos esses componentes nem que adicioná-los ao Komorebi resolveria. O próximo trabalho técnico é identificar o conjunto mínimo aceito pelo Fotos e produzir os dados correspondentes à própria foto, sem copiar calibração ou máscaras de outra cena. Não há correção confirmada para o editor nativo neste momento.

Referência: [Capturing photos with depth — Apple](https://developer.apple.com/documentation/avfoundation/capturing-photos-with-depth).

## Par antes/depois do Fusion

O usuário forneceu `Arquivo 3.zip` com `NO_FUSION_1007_005.HEIC` (antes) e `NO_FUSION_1007_007.HEIC` (depois), e confirmou que a segunda foto oferece edição de profundidade no Fotos. A análise usou ExifTool e ImageIO fora do sandbox, necessário para decodificar os auxiliares HEIC no macOS.

| Campo | Antes | Depois |
| --- | --- | --- |
| Resolução principal | 4032 × 3024 | 4032 × 3024 |
| Orientação | 6 | 6 |
| ImageCaptureType | ProRAW | ProRAW |
| CustomRendered | Custom | Custom |
| PhotosAppFeatureFlags | 0 | 1 |
| Disparidade | Ausente | 768 × 576, Float16 (`hdis`), orientação 6 |
| Accuracy / Quality / Filtered | Ausentes | relative / high / True |
| DepthDataVersion | Ausente | 65541 |
| Calibração intrínseca e distorção | Ausentes nos metadados de profundidade | Presentes |
| REND / SimulatedAperture | Ausentes | Presentes / 2.0 |
| Região XMP de foco | Ausente | Centro (0.5, 0.5), largura 0.158, altura 0.317 |
| Auxiliares HEIC depois | — | Disparidade e HDR gain map |

O resultado não contém auxiliar PortraitEffectsMatte nem as máscaras semânticas observadas no arquivo anterior à conversão. Assim, o arquivo que o usuário confirmou funcionar contradiz a hipótese de que aquelas máscaras sejam obrigatórias em todos os casos. Também mostra que mudar ImageCaptureType para Portrait e CustomRendered para 9 não é necessário para esse caso. Não há PortraitScore/PortraitScoreIsHigh na extração do resultado: a ausência desses campos é diferente dos valores 0/False adicionados pelo AVDepthData sintético do Komorebi.

O Fusion recompôs o contêiner e eliminou diversos auxiliares de estilos; a redução de tamanho não corresponde a redução da resolução principal. A presença de calibração no resultado é um fato do arquivo, mas não comprova como o Fusion a obteve nem sua correspondência física com a cena.

Os testes A/B/C não modificavam PhotosAppFeatureFlags. Foi preparada uma cópia D a partir de `0.heic`, alterando somente essa flag de 0 para 1, para isolar uma diferença observada no par que funciona. O SHA-256 dos dados decodificados do mapa é idêntico ao original (`98e04099fec56ecb32e1ddb98edf94c1ff2883cc7be94507a4f1900bfc8d0f3b`). Não foi copiada calibração ou receita de outra cena. A flag é um experimento de reconhecimento, não uma alteração de produção nem uma confirmação de detecção de pessoa/animal na foto. Seu resultado no iPhone ainda está pendente.

O usuário também testou D e informou que não houve controle de edição no Fotos. Logo, a flag isolada é insuficiente neste arquivo; isso não determina se é necessária em combinação com outros campos.

## Remoção de grupos a partir do arquivo que funciona

Para evitar acrescentar grupos incompatíveis ao arquivo sintético, o teste seguinte parte de `NO_FUSION_1007_007.HEIC`: G é um controle regravado pelo ImageIO, H remove apenas os nove campos de calibração listados abaixo, e I remove apenas REND e SimulatedAperture. Todos passam pela mesma reconstrução de imagem principal, disparidade e gain map HDR. Nenhum resultado de importação dessas três cópias foi confirmado ainda.

H remove `depthData:IntrinsicMatrixReferenceWidth`, `IntrinsicMatrixReferenceHeight`, `IntrinsicMatrix`, `ExtrinsicMatrix`, `LensDistortionCoefficients`, `InverseLensDistortionCoefficients`, `LensDistortionCenterOffsetX`, `LensDistortionCenterOffsetY` e `PixelSize`. I remove `depthBlurEffect:RenderingParameters` e `SimulatedAperture`. A presença/ausência de cada campo foi verificada após a gravação com ImageIO.

G/H/I conservam flag 1, Quality high, Filtered True, orientação 6, gain map HDR e a geometria do mapa de 768 × 576. O SHA-256 do mapa decodificado é idêntico entre as três cópias: `475d4ad717279a95cc20be6e0812ef14f009339e5f53f582db78a32e087eae00`. ImageIO pode recomprimir os dados em relação à referência original. Se G não habilitar o editor, os resultados de H e I não isolam o efeito dos grupos retirados: é necessário primeiro investigar a reconstrução/exportação do contêiner. Nenhum desses experimentos altera o fluxo de produção do app.

### Resultados no iPhone informados pelo usuário

- G: indicador disponível e ajuste de desfoque funcional. Isso confirma que a reconstrução ImageIO empregada no experimento não impede, por si só, a edição no Fotos.
- H: indicador presente, mas sem possibilidade de ativar o retrato e sem opção na edição. A remoção conjunta dos nove campos de calibração rompeu a ativação nesse arquivo; ainda não demonstra qual campo individual é necessário.
- I: indicador presente, retrato ativável e opções de iluminação de palco disponíveis, mas sem ajuste de desfoque. A remoção conjunta de REND e SimulatedAperture rompeu o ajuste de desfoque nesse arquivo; ainda não distingue o papel individual dos dois campos.

O mapa auxiliar isolado não implementa o requisito. O encoder do Komorebi precisa tanto de informações geométricas suficientes para a ativação quanto de parâmetros de desfoque compatíveis. O próximo teste deve reduzir o grupo de calibração até identificar os campos mínimos necessários. O sucesso da referência não autoriza usar sua calibração ou seus parâmetros de foco em outras fotos. A captura atual do Komorebi não persiste AVCameraCalibrationData, e o checkpoint Depth Anything V2 Small fornece disparidade relativa, não esses parâmetros.

Foi preparada J a partir do Fusion pelo mesmo processo de G: mantém IntrinsicMatrix, IntrinsicMatrixReferenceWidth e IntrinsicMatrixReferenceHeight e remove os outros seis campos do grupo de calibração. Mantém REND, SimulatedAperture e demais metadados. O mapa decodificado tem o mesmo SHA-256 de G/H/I. Se J oferecer ajuste de desfoque, isso indicará que os seis campos retirados não são necessários para esse arquivo e permitirá concentrar a investigação na matriz intrínseca. O teste não substitui a calibração por valores estimados e ainda aguarda resultado no iPhone.

O usuário informou que J mostra o indicador, mas não permite ativar nem regular. Foi então realizada uma análise local: construir AVDepthData a partir da disparidade do Fusion e retirar individualmente cada um dos nove campos. Remover IntrinsicMatrix, IntrinsicMatrixReferenceWidth, IntrinsicMatrixReferenceHeight, ExtrinsicMatrix ou PixelSize faz `cameraCalibrationData` retornar nil. Remover individualmente ou em conjunto os quatro campos de distorção não elimina a calibração. J também resulta em calibração nil. Isso identifica os campos necessários para reconhecimento por AVDepthData nesse arquivo, ainda sem comprovar suficiência no editor do Fotos.

Foi preparada K, retirando somente LensDistortionCoefficients, InverseLensDistortionCoefficients, LensDistortionCenterOffsetX e LensDistortionCenterOffsetY. Após salvar, confirmou-se `cameraCalibrationData != nil`, Quality high, Filtered True e o mesmo SHA-256 do mapa de G. REND e SimulatedAperture permanecem. K ainda aguarda resultado no iPhone. Os valores conservados são os da própria foto de referência; nenhuma calibração dela foi acrescentada às fotos sintéticas do Komorebi.

O usuário confirmou que K permite ativar e regular. Para esse arquivo, o conjunto com matriz intrínseca, dimensões de referência, matriz extrínseca e tamanho de pixel é suficiente para conservar o ajuste no Fotos, sem os quatro campos de distorção. REND e SimulatedAperture continuam presentes. Isso valida a redução de calibração na referência, não a geração sintética em outras fotos.

## Prova com o mapa do Depth Anything na mesma captura

Foi executado localmente o modelo oficial do app na foto anterior à conversão, `NO_FUSION_1007_005.HEIC`. A cópia L usa essa imagem principal e o mapa estimado pelo PhotoDepthEngine do Komorebi, com os cinco campos geométricos de K e REND/SimulatedAperture da versão derivada da mesma captura. Também mantém DepthDataVersion da referência e a flag 1. Nenhum parâmetro dessa geometria foi transplantado para a foto anterior `0.heic`, que pertence a outra captura.

L mantém Accuracy relative, Quality low, Filtered False, PortraitScore 0 e PortraitScoreIsHigh False produzidos pelo AVDepthData sintético. Não afirma que o mapa tem qualidade medida ou filtragem da câmera. O descritor do mapa usa orientação 6, correspondente ao raster da captura, e mantém referência intrínseca de 4032 × 3024. O mapa é normalizado aproximadamente entre 0,01 e 1, portanto os parâmetros de foco do Fusion podem não produzir a mesma intensidade visual; o teste primeiro verifica se o Fotos permite os controles com o mapa sintético.

Esse experimento distingue os requisitos de geometria/renderização da natureza sintética do mapa. O app ainda não dispõe desses cinco campos e da receita REND para uma foto arbitrária existente na galeria. A aceitação de L no iPhone está pendente. A compilação do app iOS não foi iniciada; somente o executável de análise local e o modelo Core ML foram usados.

O usuário informou que L não oferece edição no Fotos. A presença de calibração reconhecida, REND e SimulatedAperture não foi suficiente para o arquivo com esses valores sintéticos. Isso ainda não isola se o problema está nos valores/geometria do mapa ou nas declarações Quality low, Filtered False, PortraitScore 0 e PortraitScoreIsHigh False.

## Teste cruzado dos indicadores de profundidade

M parte de K e mantém seu mapa, calibração e receita, mas passa a declarar os quatro indicadores sintéticos de L. N parte de L e mantém seu mapa sintético, calibração e receita, mas passa a declarar Quality high, Filtered True e remove ambos os campos PortraitScore, como K. São intervenções somente de diagnóstico: N não comprova qualidade alta nem filtragem efetiva do mapa, e os valores não foram introduzidos no encoder de produção.

Após a gravação, AVDepthData reconhece calibração em ambos; M é relative/low/unfiltered e N relative/high/filtered. ExifTool confirma flag 1, abertura 2.0 e as declarações esperadas. As cópias foram reconstruídas com o mesmo processo ImageIO, que pode recomprimir mapas e imagens. Os testes cruzados no Fotos ainda estão pendentes. O arquivo inspection.txt é apenas um relatório separado e não participa da importação da foto.

O usuário informou: M apresenta o indicador, mas não permite ativar; N não apresenta o indicador. Em M, trocar somente os quatro indicadores em um arquivo antes funcional rompeu a ativação. N mostra que os indicadores da referência não bastam para a variante sintética. Ainda não se pode atribuir esse resultado à incompatibilidade do modelo, pois uma comparação posterior identificou outros metadados ausentes.

## Foco e iluminação ausentes na prova sintética

A comparação integral dos grupos EXIF/Apple/XMP entre K e N identificou que N não tinha a região `mwg-rs` de foco da imagem principal nem `portraitLightingEffect:EffectStrength = 0.480556` da disparidade. A prova L partia da imagem anterior à conversão, que não tinha região de foco, e copiava somente os oito campos explicitamente selecionados de profundidade. Portanto L/N não eram equivalentes à referência em todos os metadados de retrato.

Foi preparada O a partir de N, incorporando a região de foco e a intensidade de iluminação de K, da mesma captura. Conserva os cinco campos de calibração, REND, abertura 2.0, flag 1, orientação 6 e HDR gain map (headroom 3.38185). Continua sendo um teste com Quality high/Filtered True alterados apenas para diagnóstico, sem comprovação dessas características. A regravação conserva geometria 1024 × 768, com erro máximo 0.01171875 observado nos valores em relação a N. O mapa continua sendo o estimado pelo Depth Anything, não o do Fusion. O ainda aguarda teste no Fotos; não foi incorporado ao encoder do app.

O usuário informou que O não apresenta o indicador. Os dois campos acrescentados não resolveram essa variante.

## Substituição do mapa na referência funcional

P usa K como base da imagem principal, metadados e gain map. Apenas os dados do mapa de disparidade são substituídos por valores de N, estimados pelo Depth Anything na mesma captura. A estimativa é redimensionada de 1024 × 768 para 768 × 576 e seu intervalo relativo é remapeado linearmente de 0,010002136–0,99609375 para 0,20275879–1,296875, igual ao intervalo medido em K. Mantém Float16, orientação 6 e descritor da referência com bytes por linha ajustados para 1536.

Após gravar P, a comparação dos campos extraídos nos grupos XMP, Apple, IFD0 e ExifIFD com K não apresentou diferenças. AVDepthData confirma calibração reconhecida, relative/high/filtered e geometria 768 × 576. Essas declarações de qualidade e filtragem são as da referência e permanecem somente para diagnóstico: não são comprovação das características do mapa sintético. O remapeamento não transforma a estimativa em distância física medida.

Esse teste reduz diferenças de metadados, resolução e intervalo existentes em L/N/O, sem copiar geometria entre capturas distintas. A reconstrução ImageIO pode recomprimir a imagem principal, como no controle G já confirmado. P ainda aguarda teste no Fotos e não altera o encoder de produção.

O usuário confirmou que P apresenta o indicador e permite habilitar e regular. Isso demonstra aceitação de um mapa gerado pelo Depth Anything nesse arquivo com a estrutura, geometria e parâmetros da mesma captura, após remapeamento para a faixa e resolução da referência. As intervenções foram combinadas, portanto não isolam a contribuição individual da resolução, faixa, imagem principal e outros componentes. Ainda não validam o encoder atual do app ou a geração em fotos arbitrárias.

## Geometria virtual estimada da própria foto

Q parte de P e substitui a matriz intrínseca e PixelSize por estimativas calculadas do EXIF da própria foto, sem conservar os valores de calibração do Fusion. Para um modelo pinhole aproximado, usa `focalPixels = focalLength35mm × hypot(width, height) / hypot(36, 24)`, ponto principal no centro do raster e `pixelSizeMM = focalLengthMM / focalPixels`. A matriz extrínseca é a identidade, correspondente ao referencial virtual escolhido. Referência geométrica e mapa continuam alinhados ao raster de 4032 × 3024 com orientação 6.

Para a captura enviada, a matriz virtual tem focal em pixels 2795,6889889751546 e PixelSize 0,0024197970133053716 mm; AVDepthData reconhece a calibração resultante. Esses valores são estimados, não uma calibração medida do sensor: EXIF, recortes, fusão de câmeras e correções do ISP podem alterar a geometria efetiva. A receita REND permanece a da mesma captura para isolar a mudança de geometria, e os indicadores de qualidade/filtragem continuam somente como intervenções de diagnóstico. Q ainda aguarda teste no Fotos. Nenhuma estimativa foi integrada ao encoder de produção.


O usuário confirmou que Q também permite ativar e regular. Isso valida a geometria EXIF virtual nessa variante; não comprova a receita completa em outras cenas ou o commit PhotoKit no mesmo asset.

## Integração do encoder e amostra R

O módulo agora produz a geometria estimada do EXIF de cada foto, suaviza espacialmente a estimativa e grava mapa Float16 com lado maior até 768, na faixa relativa 0,20275879–1,296875. Acrescenta região central de foco, flag de retrato, abertura 2.0, intensidade inicial de iluminação e REND. Mantém Accuracy relative, omite pontuações de confiança não medidas e identifica produtor, projeção estimada e filtragem nos metadados. Quality high é classificação do produtor para mapa denso, finito e não constante, sem afirmar precisão física. Filtered corresponde à suavização espacial efetivamente aplicada.

O perfil REND estático foi extraído da amostra enviada; os registros dependentes da cena 0x190–0x199 e 0x1c2–0x1c5 são reconstruídos por heurísticas a partir do foco central e headroom. Não contém pixels, localização, identificadores de captura ou calibração de outra câmera. A atribuição MIT da pesquisa XDRemux está no módulo. Esses parâmetros ainda requerem validação de efeito visual em diferentes cenas.

A amostra R é gerada da foto original do tablet, usando apenas o modelo empacotado e o mesmo PhotoDepthEngine.write utilizado no app. Não usa a imagem nem a geometria específica da referência Fusion. A região de foco é mesclada após incorporar auxiliares, pois AddImageFromSource não serializa o objeto XMP fornecido nas opções. O teste nativo cobre persistência da região, EXIF, geometria, REND e classificação nas oito orientações, além de recuperação e cancelamento. R aguarda teste no Fotos; não houve compilação do aplicativo iOS nesta etapa, conforme solicitação do usuário.

## Foto do Komorebi com controle sem efeito visual

O usuário relatou ausência do botão para ativar/desativar retrato no asset editado, com ajuste de abertura disponível na edição mas sem mudança visual. O arquivo correto analisado foi `0 2.heic`, exportado pelo Komorebi. AVDepthData reconhece geometria virtual, Accuracy relative, Quality high e Filtered True. O mapa tem 576 × 768 pixels, intervalo 0,20275879–1,296875, mediana 0,30151367 e centro 0,67041016: não é uniforme. EXIF, flag 1, região de foco e REND estão presentes. Isso não demonstra execução do efeito pelo Fotos.

Comparado com Q, além dos parâmetros adaptados de ativação/HDR, o encoder zerou os registros REND 0x194, 0x195, 0x196, 0x197 e 0x199, originalmente 0,0025, 0,0075, 0,9, 1 e 0,2. A hipótese é que retirar esses valores tenha afetado a renderização. Seus papéis não estão comprovados para o pipeline do Fotos; não se trata de correção validada.

Foram geradas S (controle regravado com a receita atual) e T (mesmo processo, repondo apenas os registros 0x194–0x199 da receita Q; 0x198 já era zero). Não copiam calibração, mapa, foco ou HDR de Q. Após gravar, os mapas decodificados de S/T têm SHA-256 idêntico `f7a4cb6a33b0140ffac9546c6241a2cbda25e89e0be9cc7f2c2bcc63a2504936`; ExifTool confirma igualdade dos grupos EXIF, Apple, regiões, geometria e produtor. Somente os cinco registros indicados diferem na receita. S/T aguardam importação e teste de mudança visual de desfoque no iPhone. O código do encoder permanece inalterado até esse resultado. O comportamento do botão no asset PhotoKit deve ser distinguido do comportamento das cópias importadas.

O usuário testou S e T e informou que nenhuma apresentou mudança visual ao regular o desfoque. Repor os cinco registros não foi solução suficiente; isso não valida a função isolada de cada registro nem identifica a causa restante.

## Comparação de Luz de palco mono

O usuário enviou `NO_FUSION_1007_011.heic` e `sofa-de-mesa-placato-carro-ambiente-cor_20261007-224115.heic`, com o mesmo efeito de palco mono aplicado. A leitura inicial ExifTool conseguiu registrar os metadados: ambos têm raster 3024 × 4032, orientação normal, auxiliar de disparidade, Accuracy relative, Quality high, Filtered True e PhotosAppFeatureFlags 0. O arquivo Komorebi mantém a geometria virtual e a receita REND/abertura/iluminação; a extração do Fusion não apresenta esses campos. Como são representações já editadas, a ausência desses campos extraídos não prova ausência no recurso usado para gerar o efeito original.

Na tentativa seguinte de decodificação, ambos os caminhos já não existiam no filesystem. Nenhuma prévia ou mapa desse par pôde ser obtido, portanto a diferença visual e a qualidade da separação do sujeito ainda não foram analisadas. Não atribuir a diferença a mapas invertidos, máscaras ausentes ou parâmetros sem analisar os pixels e os recursos originais.

O usuário reenviou o par e as cópias foram preservadas antes da análise. A decodificação confirmou a diferença visual: Fusion deixa o entorno superior quase preto e conserva objeto/parte próxima da mesa; Komorebi deixa parede, cabos, objetos do fundo e mesa visíveis, com iluminação central. Ambos os mapas têm 576 × 768, orientação 1 e o mesmo sentido de disparidade (região próxima da mesa mais clara, fundo distante escuro), reconhecendo contornos do objeto. Não há evidência de inversão global ou mapa uniforme.

Fusion tem disparidade mínima 0,028915405, máxima 1,296875 e valor central 1,0332031; Komorebi mínima 0,20275879, máxima 1,296875 e centro 0,67041016. São capturas com enquadramento ligeiramente diferente e mapas distintos, portanto os valores não isolam causa nem podem ser tratados como medições de distância. A normalização fixa do Komorebi, calibrada empiricamente com outra cena, não demonstra correspondência adequada com o renderer nesta captura.

A exportação Fusion já editada conserva só os indicadores de profundidade na extração ImageIO e tem cameraCalibrationData nil; não conserva REND, SimulatedAperture ou região de foco extraídos. A Komorebi ainda conserva receita e geometria virtual. Logo a imagem Fusion renderizada comprova o efeito visual reportado, mas sua representação exportada não permite reconstruir as entradas do pipeline que o produziu. É necessário o arquivo Fusion com depth data antes do efeito desta captura para comparar o produtor sem confundir o resultado renderizado com os recursos de entrada. Nenhuma correção de produção foi aplicada com base exclusivamente nessa comparação.

## Nova captura Fusion 013 para separar geometria e mapa

`NO_FUSION_1007_013.HEIC` foi copiada antes da análise e contém a estrutura completa: raster 4032 × 3024, orientação 6, mapa 768 × 576 com mesma orientação, flag 1, geometria reconhecida, região central de foco e REND. A receita REND é byte a byte idêntica à de Q, apesar de ser outra captura. A disparidade decodificada varia de 0,010414124 a 1,2929688; mediana 0,5053711 e centro 1,1865234. Isso reforça que a faixa fixa mínima 0,20275879 da implementação não reproduz a normalização do Fusion em qualquer cena, sem provar causalidade para a falha visual.

Foram preparadas três variantes da mesma captura pelo mesmo processo ImageIO. U é o controle Fusion regravado. V conserva o mapa e a receita Fusion, substituindo a projeção pela geometria virtual estimada do EXIF e removendo os quatro campos de distorção não gerados pelo Komorebi. W conserva toda a geometria e a receita da captura Fusion 013, substituindo somente o mapa por inferência do modelo Depth Anything empacotado sobre a mesma imagem; seus valores são remapeados para a faixa do mapa dessa própria captura, com resolução e orientação iguais. W é diagnóstico: conserva declarações de qualidade e filtragem da referência para não mudar metadados simultaneamente, sem validá-las como propriedades do novo mapa ou converter valores em distâncias medidas.

U e V têm SHA-256 idêntico do mapa decodificado `2cde85a4d931e5e24e94439d1dcad8311f1462c5a55aab0b013a28c2042eb2cc`. W tem mapa distinto `ccde46ea87ae795c601f78213626cc6034cd88431aba0316c854f3fd9ad4c16a` e não difere de U nos grupos de metadados EXIF, Apple, perfil de cor, geometria, foco, receita e iluminação extraídos. Todos mantêm calibração reconhecida por AVDepthData. A inferência usa exclusivamente a própria captura; nenhuma geometria/mapa de outra cena foi transplantada. Aguardar testes de mudança visual de desfoque e Luz de palco mono em U/V/W. O encoder do app permanece inalterado nesta etapa; não houve compilação do app.

O usuário confirmou efeito visual correto em U e W e comportamento incorreto em V. Isso isola o grupo de geometria substituído por V (matriz intrínseca, PixelSize e remoção dos quatro campos de distorção) como suficiente para causar a regressão nesta captura. O mapa Depth Anything de W, com geometria e receita da captura, produz desfoque e iluminação corretos no teste reportado. Não isola qual campo geométrico é responsável, nem valida a fórmula EXIF para renderização em outras fotos.

## Perfil nominal experimental após U/V/W

A fórmula de equivalência focal EXIF foi retirada do encoder. O conjunto experimental `NominalPortraitRendererV1` usa a matriz, PixelSize e coeficientes do preset funcional como coordenadas nominais de renderização, escaladas para o raster; rasters em pé rotacionam o ponto principal e o centro de distorção da referência. Não deve ser apresentado como calibração medida da câmera de origem. Todos os mapas permanecem Accuracy relative e são identificados como NominalPortraitRendererV1/DepthAnythingV2SmallF16/SpatialGaussian nos metadados próprios. Esse perfil é uma hipótese de interoperabilidade para o renderer, não uma garantia de geometria física correta, recortes, outras lentes ou outros aparelhos. Obter calibração medida exige suporte e opções específicas de captura AVFoundation; não foi implementada coleta adicional de calibração nesta etapa.

Também foram removidos os overrides dinâmicos REND heurísticos em favor do preset exato de U/W, ajustada a faixa nominal para 0,01–1,3, mantida suavização espacial real e adotadas as dimensões da região nominal de foco alinhadas ao raster. Isso combina mudanças e requer novo teste do encoder completo. A elegibilidade não depende mais de focal EXIF porque o perfil nominal não faz essa estimativa. JPEG/HEIC estáticos continuam disponíveis, com caráter experimental; compatibilidade global e commit no mesmo asset não são declarados validados.

Na mesclagem das regiões, os caminhos compostos anteriormente usados não resolviam RegionList no ImageIO e podiam descartar regiões existentes. A implementação agora lê valores estruturados pelos nomes locais, preserva regiões não Focus e substitui o foco anterior por uma única região nominal. O teste de arquivo com Face preexistente confirma preservação de Face/Focus após geração e classificação.

X é gerada da foto colorida do Komorebi usada no controle S, pelo PhotoDepthEngine completo atualizado. Não é uma simples alteração do arquivo Fusion nem cópia de seu mapa. Testes nativos de oito orientações, recuperação, conflito, cancelamento, geometria, EXIF, rating e regiões passaram, assim como lint/typecheck e 196 testes JS. X ainda aguarda avaliação visual no Fotos; não houve compilação do aplicativo iOS.

## Retorno de U/V/W/X após aplicação no Fotos

O usuário reconfirmou U e W como funcionando perfeitamente, V incorreto. Em X o botão de ativação não apareceu inicialmente, mas abrir Editar permitiu aplicar o efeito. As quatro cópias devolvidas foram preservadas. A inspeção visual de W e X mostra supressão real do fundo no efeito Luz de palco mono, ao contrário da versão anterior do encoder; há diferenças de iluminação do objeto e enquadramento entre as capturas. Essa observação confirma o efeito nessa amostra do encoder, sem equivaler a validação de todas as cenas, lentes, regiões ou fluxo PhotoKit no mesmo asset.

As representações devolvidas têm CustomRendered Portrait e PhotosAppFeatureFlags 0. U/V/W já não expõem receita REND ou geometria completa na extração; X mantém REND e geometria nominal, mas perdeu as regiões e os marcadores próprios na exportação. Esses são arquivos resultantes do editor/exportação, não equivalentes aos arquivos de entrada das variantes. Não inferir a causa da ausência do botão inicial somente desses metadados após edição. O app orienta a abrir Editar no Fotos para ajustar Retrato. A pendência do botão inicial é separada da confirmação de efeito visual; `validated` global permanece false até testar gravação no mesmo asset, avaliação, reinício e reversão.

## Mão sobre tabuleiro e erro PhotoKit 3302 — 8 de outubro

Os arquivos `manao-com-chess-pazo-sobre-mesa_20261008-090653.heic` e `NO_FUSION_1008_001.HEIC` foram preservados em uma pasta temporária antes da análise. São capturas diferentes da mesma cena, com pequeno deslocamento do enquadramento. O primeiro já tem Luz de palco mono aplicada: raster 3024 × 4032, orientação 1, disparidade 576 × 768, calibração nominal reconhecida, Quality high e Filtered True. O mapa não está vazio nem globalmente invertido: distingue a mão, os dedos, o tabuleiro e as peças. Valores decodificados: mínimo 0,010002136, máximo 1,2949218, mediana 0,070495605 e centro 0,5341797. A imagem principal confirma iluminação parcial da mão; a persistência da receita nominal não comprova que seus parâmetros de foco/iluminação sejam apropriados para essa cena. Nenhuma alteração especulativa desse perfil foi aplicada.

O No Fusion enviado é a foto colorida antes de gerar profundidade. Tem raster 4032 × 3024, orientação 6, HDR gain map 2016 × 1512 e nenhum auxiliar de profundidade. Portanto não é uma referência do mapa ou da iluminação produzidos pelo Fusion. O usuário confirmou que o erro aparece depois do progresso. O SDK identifica 3302 como `PHPhotosErrorInvalidResource`, falha na validação do recurso; o código isolado não revela qual propriedade o Fotos rejeitou.

Foi identificada uma incompatibilidade no fluxo de edição: o encoder conservava a orientação EXIF original, enquanto a [documentação de PHContentEditingOutput](https://developer.apple.com/documentation/photos/phcontenteditingoutput/renderedcontenturl) exige pixels já orientados e metadados up. `PhotoDepthEditingImage` agora normaliza a imagem antes da inferência, mantendo resolução e perfil de cor, girando os auxiliares HDR/mattes sem interpolação e ajustando as regiões normalizadas. A inferência e o perfil nominal passam a operar nesse raster. A reversão também prepara uma representação orientada para o PhotoKit; o backup original permanece intacto. Layouts auxiliares não suportados falham explicitamente, sem descartar HDR silenciosamente. A normalização pode recomprimir a imagem principal.

A reprodução local na foto No Fusion gerou uma cópia 3024 × 4032, orientação 1, disparidade 576 × 768 e HDR gain map 1512 × 2016, preservando Display P3, EXIF e headroom 4,807737. Essa cópia está em `/private/tmp/komorebi-depth-1008/fusion-generated.heic`. Isso valida a geração do arquivo, sem provar que o commit no asset existente passou no iPhone. Foram acrescentados registros de dimensões/orientação antes do commit e domínio/código/erro subjacente em falhas para distinguir rejeições restantes.

Passaram lint, verificação de tipos Swift com o SDK iOS e os testes nativos: aparência dos pixels nas oito orientações, valores/espelhamento/padding de auxiliares, giro das regiões de rosto, inferência, incorporação de profundidade, avaliação, recuperação e cancelamento. Não foi compilado ou instalado o app. Continuam pendentes o reteste do commit/reversão no iPhone e a correção visual do Palco Mono; `validated` permanece false.

## Destino da edição, Estilos e Live Photos — 8 de outubro

A galeria agora oferece “Criar uma cópia”, inicialmente desligado. Desligado, grava `PHContentEditingOutput` no mesmo asset e mantém backup para reversão; ligado, cria outro asset com data, localização, favoritos, álbuns e classificação. A atualização da galeria mantém a posição da original. Edições já aplicadas continuam oferecendo reversão e geração de cópia a partir do backup, mesmo quando o Fotos não devolve a profundidade no recurso renderizado.

HEIF com `styleMetadata`/`styledeltamap` usa uma mesclagem de contêiner: a profundidade e seus metadados vêm do encoder; pixels, itens opacos dos Estilos, propriedades e referências existentes são conservados. O arquivo final é verificado antes de salvar. Isso evita regravar o grafo de Estilos por ImageIO. A cópia mantém a orientação de captura, alinhada ao mapa. Há uma limitação explícita: Estilos em imagens que exigem rotação dos pixels e Estilos em Live Photos requerem a opção de cópia. A edição no mesmo asset é bloqueada nesses casos, porque a normalização/edição Live pelo caminho atual não conserva o grafo. Não há fallback silencioso para imagem achatada. Estilos presentes somente no recurso original de uma edição externa já achatada pelo PhotoKit não são reconstruídos.

Live Photos deixam de ser rejeitadas por formato. Na cópia, o vídeo da versão atual do `PHContentEditingInput.livePhoto` acompanha a imagem; o identificador Apple da imagem deve coincidir com o identificador QuickTime do vídeo. A edição no mesmo asset passa por `PHLivePhotoEditingContext`, mantendo movimento/áudio e adicionando profundidade à imagem estática produzida pelo contexto. Não gera desfoque temporal no vídeo. O backup de Live Photo inclui o vídeo correspondente, para não combinar uma imagem antiga com o identificador de um vídeo reeditado ao gerar outra cópia. A reversão usa contexto Live para manter o asset animado.

Validação local: lint, TypeScript, verificação de tipos com SDK iOS, testes de recuperação (incluindo backup de vídeo), oito orientações, inferência, geração/decodificação HEIF, classificação e preservação de itens/propriedades/referências opacas em fixture sintética. A amostra HEIF/HDR local também decodifica com profundidade após a mesclagem. As fixtures de grafo não comprovam os controles de Estilos no Fotos. Ainda é necessário compilar/instalar e testar no iPhone: aplicação na original, cópia, reversão após reinício, Estilos Apple antes/depois, Live com som/movimento, Live previamente editada, download iCloud, cancelamento e biblioteca limitada. `validated` permanece false.
