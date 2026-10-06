# Image Stacking Engine

O módulo `camera-image-stacking` mantém captura e processamento fora da bridge
JavaScript. A bridge recebe apenas configuração, progresso e a URI do resultado
final. O engine existe somente no iOS; a API TypeScript devolve capacidades
vazias nas demais plataformas.

## Fluxo

1. `ImageStackingCameraView` mantém a sessão e o preview AVFoundation.
2. `StackingCaptureCoordinator` valida exclusividade, escolhe o plano da
   estratégia e captura os frames. Bulb e Motion Blur travam foco, exposição e
   balanço de branco; Dupla exposição mede cada disparo de forma independente.
3. Capturas fotográficas são gravadas em um `FrameStore` temporário por sessão.
   Bulb usa diretamente `CVPixelBuffer` e nunca grava frames intermediários.
4. `FrameAnalyzer` mede luminância, nitidez e diferença local.
5. `FrameAligner` tenta registro homográfico com Vision e, em caso de falha,
   tenta registro translacional. Frames sem registro válido são rejeitados.
6. A estratégia compõe em espaço linear com o `CIContext` Metal compartilhado.
7. `StackingExporter` recorta a interseção válida, preserva os metadados do
   frame de referência quando aplicável e gera HEIF ou JPEG.
8. O coordenador restaura a câmera e remove o diretório temporário em sucesso,
   falha, cancelamento, background ou desmontagem.

As filas têm responsabilidades distintas: `sessionQueue` serializa AVFoundation,
`videoQueue` serializa pixel buffers do Bulb e `analysisQueue` executa registro,
composição e exportação. Imagens intermediárias são materializadas em RGBA half
float para limitar o grafo do Core Image e manter a acumulação linear.

## Estratégias iniciais

- `NoiseReductionStrategy`: oito fotos por padrão, referência escolhida por
  nitidez/exposição, média temporal e máscara local para preservar movimento.
- `NightModeStrategy`: entre oito e dezesseis fotos segundo a luminância,
  composição robusta e finalização moderada de ruído, sombras e highlights.
- `BulbStrategy`: stream limitado a 4096 px no maior lado, amostrado em cadência
  adaptada, alinhamento global e soma ponderada pelo intervalo temporal. Para ao
  segundo disparo ou automaticamente em cinco minutos; exige um segundo válido.
- `MotionBlurStrategy`: stream contínuo com alinhamento global e média temporal
  para simular longa exposição sem acumular o brilho da cena.
- `DoubleExposureStrategy`: duas fotos em resolução completa, sem alinhamento,
  convertidas pelo Core Image para extended-linear sRGB e somadas como luz. A
  compensação padrão de -1,5 EV preserva margem para as altas luzes; uma curva
  fotográfica baseada em luminância comprime o resultado para SDR, preservando
  matiz e saturação, antes da conversão final para sRGB. Após a primeira foto,
  o preview exibe sua sobreposição e aguarda
  explicitamente o segundo disparo.

Noise Reduction e Night exigem três frames válidos. Quando atingem esse mínimo,
podem produzir resultado degradado e informam isso nos metadados.

## Como adicionar uma estratégia

1. Adicione o identificador a `StackingStrategyID` e à união
   `ImageStackingCaptureRequest`.
2. Implemente `StackingStrategy`, definindo `capturePlan` e `compose`.
3. Registre a implementação em `StackingStrategyRegistry`.
4. Se a especialidade precisar de outra fonte, implemente a captura no
   coordenador atrás de uma abstração própria, sem alterar a UI ou o contrato
   das estratégias existentes.
5. Exponha a opção no seletor somente depois de a capability nativa anunciá-la.

HDR, Super Resolution e People Removal podem reutilizar a sequência de fotos e
trocar analisador/compositor. Light Trails e Star Trails podem reutilizar o
stream do Bulb com outra política de composição.

## Integração com o app

O resultado entra na fila existente de processamento como `captureMode:
"stacking"`. LUT, grain, halation, crop, captura dupla, projetos e JPEG/HEIF
operam sobre esse arquivo. “Salvar original sem efeitos” salva o resultado
empilhado antes dos efeitos, nunca os frames fonte.

O seletor fica em um popover ancorado ao botão de stacking da barra superior.
Durante Dupla exposição, orientação, lente e demais controles permanecem
bloqueados; obturador, Cancelar e compensação EV continuam disponíveis. O EV
atua na exposição automática real do `AVCaptureDevice` antes de cada disparo;
a compensação interna da soma permanece independente.

Os metadados Komorebi usam schema 4 e incluem versão do engine, estratégia,
frames capturados/aceitos/rejeitados, duração e indicação de resultado degradado.
O fluxo de foto padrão e os controles manuais não passam pelo novo módulo.

## Validação em dispositivo

O build do target nativo e o lint verificam integração e tipos, mas a qualidade
computacional exige dispositivo físico. Validar cenas estáticas e móveis,
baixa luz com highlights, Bulb de 1 s/30 s/5 min, todas as orientações,
background/interrupção, pouco espaço e pressão de memória. Usar Instruments para
confirmar memória estável no Bulb e remoção dos diretórios `komorebi-stack-*`.

## Focus Bracketing

O modo aparece somente após confirmar as capacidades da lente física selecionada:
Metal, foco com posição personalizada e bloqueio de exposição/balanço de branco.
Android, web e câmeras virtuais não oferecem esta estratégia.

No painel, toque e arraste os dois seletores na régua Perto → Longe. Cada
seletor mostra seu foco no preview; o trecho laranja indica o intervalo. Toque
nos dois para confirmar os limites na câmera. Arraste o dial de fotos para
escolher a quantidade, com os valores vizinhos visíveis.
Escolha de 3 a 20 fotos (padrão 10). A escala é posição de lente normalizada,
não distância em metros e não abertura f/. Trocar câmera, lente ou zoom invalida
os limites; a quantidade permanece durante a sessão. Use apoio/tripé e cena parada.

Um disparo percorre uniformemente o intervalo, incluindo os dois limites.
Exposição e balanço de branco estabilizam e são travados; cada foto só é solicitada
após a confirmação do ajuste de foco. Foco tem timeout de 4 s, captura de 20 s,
e ambas as esperas observam cancelamento. A orientação é congelada na sequência.
A sessão serializa pedidos de foco do preview; o hook agrupa movimentos rápidos
para aplicar apenas o último valor pendente. `setImageStackingFocus(deviceId, null)`
restaura autofocus. Ao concluir/cancelar, o foco volta à posição do painel;
ao desativar a sessão, os controles voltam ao automático.

`FocusBracketingStrategy` usa a foto central como referência e compara registros
homográficos/translacionais em proxies suavizados. Transforms devem ser finitos,
convexos, manter a região central e ter erro de luminância linear inferior a 0,04.
O recorte comum usa os polígonos realmente válidos, com margem de interpolação,
e exige pelo menos 65% da largura/altura de referência. Qualquer foto ausente ou
sem registro válido falha a sequência inteira; não há resultado degradado.

A composição mede Laplaciano absoluto em luminância suavizada, cria um mapa
compacto de seleção de foco, regulariza ilhas com mediana e suaviza máscaras.
As regiões são fundidas em uma pirâmide Laplaciana de cinco níveis no espaço
linear compartilhado. As fontes ficam em `FrameStore` e são lidas uma por vez;
o compositor materializa a seleção e os acumuladores para limitar o grafo.
Não é um algoritmo de compensação de movimento local ou de reconstrução 3D.

O progresso adiciona `targetFrames`. Resultado e metadados acrescentam o campo
opcional `focusBracketing`, com limites, quantidade e `confirmedLensPositions`.
Os arquivos intermediários são apagados em todos os caminhos; somente a composição
segue para a fila de efeitos/salvamento. RAW, Live Photo, retrato, flash e controles
manuais gerais seguem as restrições de Image Stacking. “Original sem efeitos” é
a composição antes dos efeitos, não as fotos fonte.

### Verificação automatizada

- `npm run lint`, `npm run typecheck` e `npm test`.
- `npm run test:focus-native` em macOS com Xcode e acesso a Core Image/Metal.
  Verifica limites e quantidades, capacidades, watchdog/cancelamento, seleção de
  detalhes em três planos, registro, escala, recorte sem transparência, 20 fotos,
  composição de fontes temporárias, exportação JPEG/HEIF, orientação e limpeza.
- Build iOS sem assinatura: `xcodebuild -workspace ios/Komorebi.xcworkspace
-scheme Komorebi -configuration Debug -sdk iphoneos
-destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.

### Verificação pendente em iPhone físico

Testar macro/produtos em três planos, quantidades 3/10/20, todas as lentes e
orientações, JPEG/HEIF, LUT/grain/halation, proporções, projetos, original sem
efeitos e visualização na galeria. Cancelar durante preparação, foco, captura,
alinhamento, composição e exportação. Testar background/interrupção, pouco espaço
e pressão de memória. Confirmar que a próxima captura funciona e que nenhum
resultado parcial foi salvo. Usar Instruments para verificar memória estável
entre 3 e 20 fotos e a remoção dos diretórios `komorebi-stack-*`.
