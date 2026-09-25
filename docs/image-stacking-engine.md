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

Os metadados Komorebi usam schema 3 e incluem versão do engine, estratégia,
frames capturados/aceitos/rejeitados, duração e indicação de resultado degradado.
O fluxo de foto padrão e os controles manuais não passam pelo novo módulo.

## Validação em dispositivo

O build do target nativo e o lint verificam integração e tipos, mas a qualidade
computacional exige dispositivo físico. Validar cenas estáticas e móveis,
baixa luz com highlights, Bulb de 1 s/30 s/5 min, todas as orientações,
background/interrupção, pouco espaço e pressão de memória. Usar Instruments para
confirmar memória estável no Bulb e remoção dos diretórios `komorebi-stack-*`.
