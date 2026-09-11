# Composition Scan

Primeira versão: análise local sob demanda no iOS, no preview VisionCamera de foto normal, manual e RAW/ProRAW. Não está disponível nos previews nativos de Live Photo/Retrato nem no Android. Requer novo development build; uma atualização JavaScript não instala o módulo nativo.

## Fluxo e integração

`Scan → arm(scanId) → próximo frame → imageToken → analyze → observações → gizmos → limpar`

- `modules/composition-scan` é um módulo Expo local, descoberto automaticamente pelo autolinking em `modules/`. O pod depende de ExpoModulesCore, VisionCamera e frameworks da Apple. Não há modelo baixado, dependência npm adicional, permissão nova, upload ou escrita de imagens.
- `CompositionScanPlugin` aceita um único frame por sessão. Desfaz espelhamento físico do buffer, converte a orientação do sensor, orienta a imagem para a posição do aparelho e renderiza uma cópia com lado maior de até 640 pixels. Não retém o `Frame` depois do callback e não envia pixels ao JavaScript.
- A cópia reduzida fica em um slot nativo, acessível somente pelo token opaco e `scanId` correspondentes. `analyze` consome o slot e executa horizonte, pessoas e rostos em uma fila serial Vision. Confianças e retângulos não chegam ao renderer.
- O lock nativo impede nova reserva enquanto uma cópia/análise cancelada ainda está encerrando. `cancel` invalida o token, chama `VNRequest.cancel()` e libera buffers quando o trabalhador termina. Destruição do módulo também cancela a sessão.
- O patch `react-native-vision-camera-face-detector+1.10.1.patch` adiciona `faceDetectionEnabled`, `compositionScanId`, `compositionScanRotation`, `compositionCapturePlugin` e `compositionCaptureCallback`. A solicitação é consumida no worklet antes de retornar ao JS, evitando capturas duplicadas.
- O detector de sorriso só processa quando habilitado. Durante captura/análise do Scan fica pausado; callbacks atrasados de sorriso são ignorados. O histograma mantém sua configuração independente. Sem sorriso, histograma ou captura pendente, o wrapper passa `frameProcessor={undefined}`.
- A câmera fotográfica não passa por `takePhoto`, `takeSnapshot`, LUTs, salvamento ou flash para executar o Scan. O vídeo gravável permanece desabilitado; o frame vem da saída usada por frame processors.

O controlador testável está em `app/utils/compositionScanSession.js`, a integração React em `app/hooks/useCompositionScan.js`, as regras em `compositionAnalysis.js`, e a geometria em `compositionCoordinates.js`. As fixtures existem somente em `tests/composition/`, fora da árvore de rotas, e não são importadas pelo app.

## Estados e apresentação

`idle → capturing → analyzing → showing-results → idle`.

O botão Scan fica no canto inferior direito do preview, com altura de 44 pontos e acessibilidade. Fica desabilitado durante captura/análise, inicialização da câmera, captura/processamento de fotos ou câmera fora de foco/background. Live Photo e Retrato não renderizam o botão.

Resultados entram em 150 ms, permanecem visíveis por `SCAN_RESULT_DURATION = 5000` e saem em 200 ms. Um novo Scan durante os resultados remove os gizmos e reinicia a sessão. Resultado vazio retorna imediatamente a idle. Timeout total de captura/análise: 8 segundos. Falhas usam apenas feedback háptico e log em desenvolvimento.

Mudanças de lente, RAW, modo manual, Live Photo/Retrato, proporção, moldura retrô, captura dupla, zoom e orientação cancelam o Scan. Navegação, background e desmontagem também cancelam. O handler compartilhado por disparo na tela, volume, botão físico e sorriso cancela o Scan antes de fotografar. Movimento físico dentro da mesma orientação não atualiza o resultado: não há tracking.

## Regras e coordenadas

A API pública TypeScript separa `CompositionAnalysis` (cena e geometria) de `ScanResult` (somente gizmos). A análise retorna pixels orientados em relação ao aparelho, sem espelhamento, coordenadas normalizadas com origem superior esquerda e rotação de retorno ao preview. O renderer recebe coordenadas locais ao preview após rotação, espelhamento e crop `cover`.

O layout usado é a área interna real da câmera; safe areas, margens da moldura e borda da captura dupla não entram novamente na transformação. Na captura dupla, a sugestão se refere ao preview completo, não ao segundo recorte salvo.

- Confiança mínima: 0,7.
- Horizonte: inclinação relativa ao aparelho, sem tentar localizar a altura da linha. Abaixo de 2° não há sugestão. Dois segmentos no centro mostram alinhamento atual e referência; ao girar o aparelho, a referência acompanha a orientação.
- Pessoa: maior área visível após crop. Preferir centro de rosto associado; se não houver pessoa, considerar o maior rosto visível. Sugerir interseção dos terços mais próxima em distância de pixels. Empates priorizam superior/esquerda. Omitir deslocamentos menores que 5% da diagonal.
- Até dois gizmos nesta versão; limite geral de três. Sem evidência não há sugestão. Não há textos, scores, caixas de detecção, histórico ou gizmos gravados nas fotos.

Limitações: não localiza a altura do horizonte; não detecta sujeito genérico, animais, olhar, áreas de interesse ou leading lines. Regras de composição são heurísticas, não um julgamento estético. Um resultado estático pode ficar desatualizado se a câmera se mover.

## Verificações reproduzíveis

```sh
node --experimental-default-type=module --test tests/composition/*.test.js
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

## Resultado da validação — 11/09/2026

- 34 testes de regras, coordenadas e controlador passaram. Incluem espelhamento, rotação, crop, empates, confiança, resultado vazio, timeout, duplo acionamento, nova sessão, cancelamento e retorno atrasado.
- O teste de 20 sessões valida limpeza de timers/resultados do controlador com modelo simulado. Não representa medição de memória nativa ou performance em iPhone.
- Autolinking Apple reconheceu `CompositionScan`; `pod install --no-repo-update` concluiu.
- Exportação final de bundles iOS e Android concluiu. Isso verifica a resolução dos módulos e geração dos bundles, não o comportamento da câmera em runtime.
- O patch do detector passou por aplicação reversa e reaplicação em uma cópia temporária, sem fuzz, reproduzindo exatamente o fonte instalado.
- `npm run lint`: passou, sem erros e com três avisos preexistentes em BottomControls, CustoToggle e TopBar. `npx tsc --noEmit`: passou.
- O `xcodebuild` Debug sem assinatura chegou à compilação do módulo e apontou um argumento extra em `Promise.reject`. A chamada foi corrigida conforme a API instalada do ExpoModulesCore. O build não foi repetido, a pedido do usuário; a compilação nativa final permanece pendente.
- iPhone físico offline; validação no aparelho adiada por escolha do usuário. Nenhuma medição de latência, FPS, memória, temperatura ou consumo foi realizada no hardware.

## Roteiro pendente em iPhone

1. Foto normal, manual e RAW/ProRAW: fazer Scan com paisagem inclinada e com pessoa; confirmar ausência de disparo, flash e salvamento durante Scan.
2. Frontal/traseira, portrait/landscape dos dois lados, 3:4/9:16, retrô e captura dupla: usar cena assimétrica para conferir posição e espelhamento dos gizmos.
3. Novo Scan durante exibição, toques repetidos durante processamento, disparo por todos os meios, troca de lente/zoom/modo e navegação/background: nenhum resultado antigo deve reaparecer.
4. Cena sem pessoas/horizonte confiável e baixa luz: nenhum gizmo inventado; spinner sempre termina até timeout. Testar também sorriso/histograma individualmente e em conjunto.
5. Em Instruments (Time Profiler e Allocations), comparar preview ocioso com sorriso/histograma desligados antes/depois; não deve haver chamadas Vision do Scan em repouso.
6. Fazer 20 scans, aguardando auto-dismiss entre eles. Registrar aparelho/iOS, latências de captura e análise, fluidez observada, memória antes/depois e estado térmico. Memória não deve crescer de forma sustentada; não deve haver inferência concorrente.
7. Fotografar durante e depois de resultados e verificar os arquivos salvos: sem gizmos e sem regressão de LUTs, EXIF, controles manuais, RAW, sorriso e histograma.

## Falha de linker após a integração

O log completo em `.expo/xcodebuild.log` mostrou símbolos de Debug ausentes (`Sealable`, `DebugStringConvertible`, `ShadowNode::getDebugName` e funções do inspector Hermes). A comparação SHA-256 confirmou que React-Core-prebuilt e ReactNativeDependencies instalados correspondiam aos arquivos Release, enquanto o app compilava em Debug. Hermes já correspondia ao arquivo Debug; as funções do inspector ausentes estão exportadas pelo React Core Debug.

Os marcadores `.last_build_configuration` dos dois pods React estavam ausentes. Os scripts oficiais assumiam Debug nesse caso e não substituíam os binários Release. A correção local identificou a configuração instalada como Release e executou os scripts oficiais `replace-rncore-version.js` e `replace_dependencies_version.js` com `-c Debug -r 0.81.5`, usando os arquivos já presentes em `ios/Pods`. Os binários restaurados foram comparados aos arquivos Debug e seus marcadores ficaram em Debug. Os timestamps das entradas XCFramework foram atualizados para que o próximo build recopie os frameworks.

O aviso de link direto com SwiftUICore apareceu junto à falha, mas os símbolos indefinidos listados pertenciam ao React Native. Não foi adicionada dependência direta de SwiftUICore. Nenhum `xcodebuild` foi executado durante esse reparo; a confirmação final depende da recompilação pelo usuário.
