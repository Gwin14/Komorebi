# Composition Scan

Primeira versão: análise local sob demanda no iOS, no preview VisionCamera de foto normal, manual e RAW/ProRAW. Não está disponível nos previews nativos de Live Photo/Retrato nem no Android. Requer novo development build; uma atualização JavaScript não instala o módulo nativo.

## Preparação do MiniCPM-V em um Mac novo

O repositório não versiona o `llama.xcframework` gerado. Depois de clonar:

```sh
npm install
brew install cmake
npm run setup:minicpm-ios
npx pod-install ios
```

O setup fixa uma revisão conhecida do `MiniCPM-V-Apps`, compila o runtime para iPhone e simulador, instala o resultado em `modules/composition-scan/ios/Frameworks/llama.xcframework` e valida:

- `Info.plist` e as duas variantes do XCFramework;
- binários Mach-O não vazios;
- headers `llama.h`, `mtmd.h` e `mtmd-helper.h`;
- símbolos `llama_model_load_from_file` e `mtmd_init_from_file`.

O primeiro processo pode demorar vários minutos. Se o artefato instalado passar na validação, o comando seguinte apenas informa que está pronto e encerra sem recompilar. Para uma reconstrução intencional:

```sh
npm run setup:minicpm-ios -- --force
```

Depois do `pod install`, abra `ios/Komorebi.xcworkspace`, gere um novo binário e instale-o. O estado esperado nas configurações muda de `runtime-missing` para `not-downloaded`. No aparelho, use **Configurações → Inteligência do Scan → Baixar modelo** para baixar aproximadamente 1,6 GB de pesos GGUF. Quando terminar, o estado deve ser `ready`.

Máquinas de CI e Macs usados para Archive também precisam preparar o runtime antes do build. CMake e o código-fonte baixado são ferramentas de compilação; não são instalados no telefone do usuário. O app distribuído incorpora o runtime e baixa apenas os pesos sob solicitação.

## Fluxo e integração

`Scan → arm(scanId) → próximo frame → imageToken → analyze(contexto) → moldura/tracking → alinhar → zoom → limpar`

- `modules/composition-scan` é um módulo Expo local, descoberto automaticamente pelo autolinking em `modules/`. O pod depende de ExpoModulesCore, VisionCamera e frameworks da Apple. Não há modelo baixado, dependência npm adicional, permissão nova, upload ou escrita de imagens.
- `CompositionScanPlugin` aceita um único frame de análise por sessão. Desfaz espelhamento físico do buffer, converte a orientação do sensor, orienta a imagem para a posição do aparelho e renderiza uma cópia com lado maior de até 640 pixels. Durante análise/resultados também aceita frames de tracking a até 10 Hz, reduzidos para 480 pixels; nunca retém o `Frame` da VisionCamera nem envia pixels ao JavaScript.
- A cópia reduzida fica em um slot nativo, acessível somente pelo token opaco e `scanId` correspondentes. `analyze` consome o slot, recebe os três motivos recentes e a proporção atual, e executa horizonte, pessoas, rostos, saliência e retângulos em uma fila serial Vision. O MiniCPM retorna um motivo nominal e pode propor uma região retangular normalizada.
- O centro e a escala da moldura recebem a transformação homográfica do `VNTrackHomographicImageRegistrationRequest`. O JavaScript reconstrói um retângulo alinhado ao preview após cada transformação, preservando a proporção selecionada mesmo sob perspectiva. Perda terminal encerra a guia para não deixar uma moldura desancorada.
- O lock nativo impede nova reserva enquanto uma cópia/análise cancelada ainda está encerrando. `cancel` invalida o token, chama `VNRequest.cancel()` e libera buffers quando o trabalhador termina. Destruição do módulo também cancela a sessão.
- O patch `react-native-vision-camera-face-detector+1.10.1.patch` adiciona `faceDetectionEnabled`, `compositionScanId`, `compositionScanRotation`, `compositionCapturePlugin` e `compositionCaptureCallback`. A solicitação é consumida no worklet antes de retornar ao JS, evitando capturas duplicadas.
- O detector de sorriso só processa quando habilitado. Durante captura/análise do Scan fica pausado; callbacks atrasados de sorriso são ignorados. O histograma mantém sua configuração independente. Sem sorriso, histograma ou captura pendente, o wrapper passa `frameProcessor={undefined}`.
- A câmera fotográfica não passa por `takePhoto`, `takeSnapshot`, LUTs, salvamento ou flash para executar o Scan. O vídeo gravável permanece desabilitado; o frame vem da saída usada por frame processors.

O controlador testável está em `app/utils/compositionScanSession.js`, a integração React em `app/hooks/useCompositionScan.js`, as regras em `compositionAnalysis.js`, e a geometria em `compositionCoordinates.js`. As fixtures existem somente em `tests/composition/`, fora da árvore de rotas, e não são importadas pelo app.

## Estados e apresentação

`idle → capturing → analyzing → showing-results → idle`.

O botão Scan fica no canto inferior direito do preview, com altura de 44 pontos e acessibilidade. Fica oculto nas câmeras frontais e desabilitado durante captura/análise, inicialização da câmera, captura/processamento de fotos ou câmera fora de foco/background. Live Photo e Retrato não renderizam o botão.

Resultados entram em 150 ms e permanecem ativos até o alinhamento ou cancelamento. O centro da moldura precisa ficar dentro de 4% do menor lado do preview por três atualizações consecutivas. Nesse momento há um impacto háptico médio e o zoom necessário para preencher o preview é animado por 250 ms, limitado pelas capacidades da lente. A guia permanece mais 1,5 segundo e sai em 200 ms. O timeout de captura/análise continua em 120 segundos para acomodar o carregamento frio do modelo.

Mudanças de lente, RAW, modo manual, Live Photo/Retrato, proporção, moldura retrô, captura dupla, orientação e zoom manual cancelam o Scan. O zoom automático não passa pela chave de cancelamento. Navegação, background, desmontagem e todos os meios de disparo também cancelam.

## Regras e coordenadas

A API pública TypeScript separa `CompositionAnalysis` (cena e geometria) de `ScanResult` (somente gizmos). A análise retorna pixels orientados em relação ao aparelho, sem espelhamento, coordenadas normalizadas com origem superior esquerda e rotação de retorno ao preview. O renderer recebe coordenadas locais ao preview após rotação, espelhamento e crop `cover`.

O layout usado é a área interna real da câmera; safe areas, margens da moldura e borda da captura dupla não entram novamente na transformação. Na captura dupla, a sugestão se refere ao preview completo, não ao segundo recorte salvo.

- Confiança mínima dos sujeitos: 0,7.
- `framing` usa `centerX`, `centerY`, `width` e `height` entre 0 e 1000. O app valida a região, rejeita coordenadas copiadas do prompt e impõe a proporção do preview. Pessoa, grupo, rosto e regiões compactas de saliência do Vision têm prioridade sobre uma região genérica do modelo; depois vêm arquitetura e, por fim, uma moldura central com 80% do quadro.
- Toda análise bem-sucedida produz exatamente uma moldura ancorada. Em coordenadas normalizadas do preview, largura e altura são iguais; em pixels isso reproduz `4:3` ou `9:16` na orientação atual.
- A mensagem é uma única expressão nominal de até 48 caracteres. O MiniCPM escolhe assunto e motivo em categorias controladas, convertidas pelo app para português; isso evita JSON malformado, mistura de idiomas e repetição de `Destacar o assunto`. Respostas de builds anteriores ainda recebem interpretação semântica e fallback pela geometria da cena. As três últimas razões são enviadas ao prompt para incentivar variedade, mas nunca impedem a criação da moldura.
- Scores, caixas de detecção, histórico e gizmos não são gravados nas fotos.

Limitações: o modelo define a posição inicial da moldura e o Vision apenas a estabiliza; tracking não corrige uma sugestão semanticamente ruim. Movimento forte, pouca textura, parallax ou mudança de lente podem encerrar a ancoragem.

## Verificações reproduzíveis

```sh
node --test tests/composition/*.test.js
npm run lint
npx tsc --noEmit --pretty false
npx expo export --platform android --output-dir /tmp/komorebi-scan-android
```

Para integrar o módulo em um checkout com projeto iOS já gerado:

```sh
cd ios
pod install --no-repo-update
cd ..
npm run ios
```

Não editar somente `node_modules`: alterações do wrapper devem ficar no patch versionado. Ao regenerar, restringir aos fontes para excluir caches locais:

```sh
npx patch-package react-native-vision-camera-face-detector --include 'src/Camera.tsx'
```

## Resultado da validação — 18/09/2026

- A suíte atual tem 37 testes de regras, coordenadas e controlador. A cobertura específica inclui rejeição do retângulo copiado do prompt, saliência com confiança própria, categorias de assunto, interpretação de respostas antigas em inglês, variedade por geometria, fallback do modelo/Vision, proporções `4:3` e `9:16`, rotação, espelhamento, crop, tracking por translação/perspectiva, tolerância de alinhamento, três amostras consecutivas, zoom limitado, timeout, nova sessão e cancelamento.
- O teste de 20 sessões valida a limpeza de timers/resultados do controlador com modelo simulado e a conclusão explícita do zoom. Não representa medição de memória nativa ou performance em iPhone.
- Autolinking Apple reconheceu `CompositionScan`; `pod install --no-repo-update` concluiu.
- Exportação final de bundles iOS e Android concluiu. Isso verifica a resolução dos módulos e geração dos bundles, não o comportamento da câmera em runtime.
- O patch do detector passou por aplicação reversa e reaplicação em uma cópia temporária, sem fuzz, reproduzindo exatamente o fonte instalado.
- `npm run lint`: passou, sem erros e com três avisos preexistentes em BottomControls, CustoToggle e TopBar. `npx tsc --noEmit`: passou.
- A análise sintática dos fontes Swift com `swiftc -parse` passou. A compilação nativa final permanece pendente para o build no aparelho.
- iPhone físico offline; validação no aparelho adiada por escolha do usuário. Nenhuma medição de latência, FPS, memória, temperatura ou consumo foi realizada no hardware.

## Roteiro pendente em iPhone

1. Foto normal, manual e RAW/ProRAW: fazer Scan com paisagem e com pessoa; confirmar uma única moldura retangular, ausência de disparo, flash e salvamento durante Scan.
2. Traseira ampla, ultra-angular e teleobjetiva, portrait/landscape, `4:3`/`9:16`, retrô e captura dupla: confirmar proporção/orientação fixa e ancoragem durante translação, escala e perspectiva. Na frontal, confirmar ausência total do botão e do tracking.
3. Alinhar a moldura ao centro, sair e reentrar na tolerância e então manter três atualizações: confirmar um único háptico médio, zoom animado e limitado, permanência por 1,5 segundo e fade. Não deve haver disparo automático.
4. Novo Scan durante exibição, toques repetidos durante processamento, disparo por todos os meios, troca de lente/zoom manual/modo/proporção/orientação e navegação/background: nenhum resultado antigo nem zoom pendente deve reaparecer.
5. Cena sem pessoas, grupo, rosto, assunto saliente e retorno inválido/ausente do modelo: toda análise bem-sucedida deve produzir uma moldura e uma razão nominal de uma linha; o último fallback ocupa 80% do preview.
6. Em Instruments (Time Profiler e Allocations), comparar preview ocioso com sorriso/histograma desligados antes/depois; não deve haver chamadas Vision do Scan em repouso.
7. Fazer 20 scans, alinhando e concluindo cada guia. Registrar aparelho/iOS, latências de captura e análise, fluidez observada, memória antes/depois e estado térmico. Memória não deve crescer de forma sustentada; não deve haver inferência concorrente.
8. Fotografar durante e depois de resultados e verificar os arquivos salvos: sem moldura e sem regressão de LUTs, EXIF, controles manuais, RAW, sorriso e histograma.

## Falha de linker após a integração

O log completo em `.expo/xcodebuild.log` mostrou símbolos de Debug ausentes (`Sealable`, `DebugStringConvertible`, `ShadowNode::getDebugName` e funções do inspector Hermes). A comparação SHA-256 confirmou que React-Core-prebuilt e ReactNativeDependencies instalados correspondiam aos arquivos Release, enquanto o app compilava em Debug. Hermes já correspondia ao arquivo Debug; as funções do inspector ausentes estão exportadas pelo React Core Debug.

Os marcadores `.last_build_configuration` dos dois pods React estavam ausentes. Os scripts oficiais assumiam Debug nesse caso e não substituíam os binários Release. A correção local identificou a configuração instalada como Release e executou os scripts oficiais `replace-rncore-version.js` e `replace_dependencies_version.js` com `-c Debug -r 0.81.5`, usando os arquivos já presentes em `ios/Pods`. Os binários restaurados foram comparados aos arquivos Debug e seus marcadores ficaram em Debug. Os timestamps das entradas XCFramework foram atualizados para que o próximo build recopie os frameworks.

O aviso de link direto com SwiftUICore apareceu junto à falha, mas os símbolos indefinidos listados pertenciam ao React Native. Não foi adicionada dependência direta de SwiftUICore. Nenhum `xcodebuild` foi executado durante esse reparo; a confirmação final depende da recompilação pelo usuário.
