# Auditoria de performance — 2 de outubro de 2026

## Escopo e linha de base

Auditoria estática dos fluxos e recursos; não equivale a perfil de execução no
iPhone. O checkout começou sem alterações. Inventário: 215 arquivos de fontes,
63.850 linhas incluindo Rust e auxiliares; 19 assets versionados. Não há assets
com conteúdo idêntico. Nenhuma dependência será atualizada por idade.

## Mapa da arquitetura

- `app/_layout.tsx`: Sentry, gestos, safe area, SettingsProvider e Expo Router.
  SettingsProvider restaura preferências e reconcilia projetos com Fotos antes
  de liberar o carregamento. Bootstrap consulta permissões e carrega LUTs.
- `app/index.jsx`: coordena lentes, formatos, modos, controles, captura e fila.
  VisionCamera atende foto/manual/RAW; Live Photo, Retrato e Stacking usam
  sessões AVFoundation próprias. A troca tem parada e intervalo de handoff.
- Preview: worklets/Skia, sorriso, histograma, zebra e Scan no wrapper patchado.
  Sem consumidores, o frame processor é removido. Efeitos nativos usam fila
  serial, limite de frames e preview reduzido; fotos têm pipeline separado.
- Captura: `cameraUtils` recebe URI, resolve orientação/crop, prepara efeitos e
  EXIF. `usePhotoProcessingQueue` serializa salvamento e variantes. WebView
  persistente aplica LUT/grain/halation em canvas; imagens cruzam a bridge em
  base64. HEIF+, RAW pareado, Live Photo e profundidade têm caminhos próprios.
- Stacking: filas de sessão/vídeo/análise, arquivos temporários, Core Image e
  Vision; Focus Bracketing tem watchdogs, cancelamento e descarte de arquivos.
- Scan: slot único protegido por lock, cópias 640/480 px, Vision serial,
  MiniCPM opcional, tracking limitado pelo worklet e controlador JS com geração
  de sessão e timeout. Cancelar Vision não aborta uma inferência MiniCPM em curso.
- Módulos Swift: controles manuais ajustam AVCaptureDevice; RAW mantém jobs
  duráveis; Live Photo/Retrato preservam recursos auxiliares; estilos usam
  VideoToolbox e Rust; Camera Control entrega eventos e capturas bloqueadas.
- Estado: preferências em contexto/AsyncStorage; estados de câmera em hooks;
  refs protegem exclusividade e callbacks. Sensores, eventos de biblioteca,
  AppState e botões físicos têm assinaturas independentes.
- Galeria: busca até 100 fotos, resolve URIs e notas em lotes de quatro,
  agrupa datas e apresenta listas virtualizadas. Projetos/EXIF/classificações
  dependem de Fotos, arquivos e metadados persistidos.
- Build: Expo 54/RN 0.81, Hermes/New Architecture/React Compiler; patches de
  VisionCamera, detector, Skia e Liquid Glass; bibliotecas locais Swift/Rust.
  Android não implementa todos os modos exclusivos de iOS.

## Diagnóstico antes das alterações

| Prioridade | Evidência                                                                                                 | Ação / risco                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Alta       | `isActive` e botões físicos não dependem do foco/foreground                                               | Unificar elegibilidade da tela; validar retorno e handoff no aparelho                   |
| Alta       | WebView lê ImageData mesmo sem LUT; canvas mantém a última foto; exceções do callback podem não responder | Evitar cópia sem uso, liberar superfícies e responder falhas; preservar pixels e codecs |
| Alta       | Galeria continua I/O e pode publicar resultado antigo após trocar projeto                                 | Invalidar carregamentos antigos entre lotes; preservar seleção atual                    |
| Média      | Vários hooks assinam DeviceMotion; intervalo global disputado pelo nível                                  | Uma assinatura, menor intervalo requerido, parar sem consumidores/background            |
| Média      | Carregamentos simultâneos dos LUTs repetem leitura/parsing                                                | Compartilhar promessa em andamento, manter retry após falha                             |
| Média      | Configurações fazem 29 getItem em três fases                                                              | Uma leitura multiGet mantendo defaults e migração                                       |
| Média      | Scan aquece modelo com tela inativa; captura/análise canceladas podem aguardar trabalho nativo            | Restringir início do warmup à tela ativa; documentar inferência não abortável           |
| Média      | Clima pede GPS/rede mesmo com controle oculto                                                             | Carregar somente com controle habilitado; cancelar rede e descartar respostas antigas   |
| Média      | Native effect renderer retém LUT em Double e RGBA; fila principal pode acumular imagens prontas           | Remover retenção redundante e manter backpressure até apresentação                      |
| Futura     | Crop JPEG 0,86, EXIF base64, conversão final e metadados geram múltiplas passagens                        | Pipeline nativo único requer comparação de pixels/EXIF/P3/depth; não trocar nesta etapa |
| Futura     | MiniCPM retém modelo do Scan e recria modelo por foto por isolamento do estado recorrente                 | Cancelamento cooperativo e política de memória exigem testes do runtime                 |
| Futura     | Ajustes manuais têm chamadas frequentes e catches silenciosos                                             | Serialização precisa preservar pares ISO/shutter e reaplicação por lente                |
| Futura     | Startup espera reconciliação de álbuns; contexto de preferências amplo                                    | Separar sem sobrescrever edição durante restore; medir antes                            |
| Futura     | PNG do splash tem 4,84 MB; LUTs 6,9 MB                                                                    | Não recomprimir com perda nem remover assets sem validação visual                       |

## Verificação inicial

- `npm test`, `node --test tests/composition/*.test.js`: passaram.
- `npm run lint`: zero erros, dois avisos em BottomControls/TopBar.
- `npm run typecheck`: passou.
- Focus Bracketing e HEIF+ falharam dentro do sandbox por renderização; ambos
  passaram repetidos com acesso ao Metal fora do sandbox, antes das edições.
  Avisos de APIs Core Image depreciadas permanecem visíveis.

Resultados finais, arquivos e pendências serão registrados após as mudanças.

## Alterações realizadas

### Ciclo de vida e sensores

A elegibilidade da câmera agora combina foco da rota e AppState ativo. Os dois
previews recebem essa condição, os botões físicos deixam de escutar fora dela,
o disparo verifica a condição e a prontidão é invalidada ao sair. O retorno
aguarda o evento de câmera pronta. Salvamento já iniciado não é descartado.
O warmup do Scan só é iniciado com a tela em foco e o app ativo.

DeviceMotion tem uma assinatura compartilhada, intervalo mínimo dos consumidores
(50 ms para nível; 200 ms para orientação), remoção em background e quando não
há consumidores. Hooks deixam de assinar ao perder foco. Rotação só escreve no
shared value quando muda; smoothing e ângulos permanecem iguais. O cooldown de
sorriso usa timestamp, eliminando o timer que sobrevivia à desmontagem.

### I/O, concorrência e memória

- Preferências: um `multiGet` substitui 29 `getItem`; defaults, migração de
  JPEG/HEIF, strings vazias e preferências compostas permanecem preservados.
- LUTs: chamadas simultâneas compartilham o carregamento; leitura permanece
  sequencial para não aumentar o pico de memória. Falhas permitem retry.
- Galeria: gerações descartam resultados antigos, interrompem a programação
  dos próximos lotes e evitam ler notas após cancelamento. O limite de quatro
  operações simultâneas e 100 fotos foi mantido. Miniatura acompanha o álbum
  atual e fica vazia quando o álbum não contém fotos.
- Clima: GPS e rede só iniciam se o controle estiver habilitado. Cleanup aborta
  fetch e ignora respostas atrasadas. Os endpoints e os dados exibidos continuam
  os mesmos. Não houve nova permissão nem mudança na finalidade de localização.
- WebView: evita ImageData sem LUT; libera canvas e fonte da imagem após encode;
  responde a erros de desenho, encode, blob e leitura. Preserva limite anterior
  de 3000 px, JPEG 0,86 e algoritmos de LUT/grain/halation.
- Bridge de efeitos: reutiliza leitura se EXIF e pixels vêm da mesma URI;
  deduplicação com WeakSet não retém a última entrada; EXIF pertence à requisição;
  desmontagem/resultados obsoletos não injetam trabalho novo. Resposta duplicada
  não salva duas vezes; falha antiga não cancela solicitação nova.
- Preview nativo: mantém exclusividade do frame até a fila principal consumi-lo,
  evitando acumular imagens prontas com UI ocupada. Remove a referência redundante
  ao array de LUT. A alteração também atende Retrato e Stacking por symlinks.
- Logs: diagnósticos de sucesso de LUT e eventos JS do Scan limitados a DEV.
  Erros e demais logs diagnósticos não foram suprimidos.

### Arquivos modificados

| Arquivo                                                         | Motivo                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `app/index.jsx`                                                 | Atividade dos previews, bloqueio de disparo e botões físicos |
| `app/hooks/useCameraActivity.js` (novo)                         | Foco/foreground e cleanup de AppState                        |
| `app/hooks/useCompositionScan.js`                               | Warmup somente ativo e diagnóstico DEV                       |
| `app/hooks/useDeviceOrientation.js`                             | Sensor compartilhado, foco e escrita só ao mudar             |
| `app/utils/deviceMotion.js` (novo)                              | Adaptação Expo/AppState do sensor compartilhado              |
| `app/utils/motionSubscriptions.js` (novo)                       | Assinatura única e arbitragem do intervalo                   |
| `app/components/CameraLevel.jsx`                                | Participar da assinatura compartilhada                       |
| `app/components/CameraPreview.jsx`                              | Cooldown sem timer e rejeição de sorriso inativo             |
| `app/components/BottomControls.jsx`                             | Miniatura sem corrida entre álbuns; remove warning real      |
| `app/components/TopBar.jsx`                                     | Clima sob demanda e cancelamento; remove warning real        |
| `app/components/Galery.jsx`                                     | Invalidação de cargas e publicação somente da geração atual  |
| `app/utils/galleryPhotos.js` (novo)                             | Pipeline de leitura testável com cancelamento entre lotes    |
| `app/utils/settingsStorage.js`                                  | Leitura agrupada de preferências                             |
| `app/utils/lutStore.js`                                         | Deduplicação de carregamentos em andamento                   |
| `app/utils/lutProcessingHtml.js`                                | Evitar cópia inútil, liberar buffers e responder falhas      |
| `app/utils/lutProcessorComponent.js`                            | Propriedade e validade das requisições/EXIF                  |
| `modules/camera-live-photo/ios/LiveEffectPreviewRenderer.swift` | Limitar frames aguardando UI                                 |
| `package.json`                                                  | `npm test` inclui todas as suítes JS, inclusive Composition  |
| `tests/helpers/loadModule.cjs` (novo)                           | Carrega os fontes reais com adaptadores nativos explícitos   |
| `tests/helpers/hooks.cjs` (novo)                                | Harness determinístico de hooks para unidades                |
| `tests/performance/motion.test.cjs` (novo)                      | Assinaturas, frequência e 20 ciclos de background            |
| `tests/performance/loading.test.cjs` (novo)                     | LUT concorrente/retry e migração de preferências             |
| `tests/performance/effects-runtime.test.cjs` (novo)             | Runtime HTML, pixels sintéticos e falhas                     |
| `tests/performance/lifecycle.test.cjs` (novo)                   | Navegação, orientação e concorrência da bridge               |
| `tests/performance/gallery.test.cjs` (novo)                     | Limites de concorrência e cancelamento da galeria            |
| `tests/performance/weather.test.cjs` (novo)                     | GPS sob demanda e abort de rede                              |
| `docs/performance-audit.md` (novo)                              | Diagnóstico, evidências e roteiro de validação               |

Nenhuma dependência de produção foi adicionada/atualizada. Nenhum asset, modo,
formato, API pública nativa ou funcionalidade foi removido. Isso descreve o escopo
do diff; preservação visual e funcional no aparelho ainda precisa ser comprovada.

## Ganhos verificáveis e limites de medição

| Evidência                                   | Resultado                                                                       | Tipo                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Leitura inicial de preferências             | 29 chamadas getItem → 1 multiGet                                                | Contagem no código e teste de adaptador; não é tempo de startup |
| Três bootstraps concorrentes, dois LUTs     | Duas leituras totais; próximas chamadas usam cache                              | Teste com arquivos simulados                                    |
| Cinco consumidores de orientação + nível    | Uma assinatura nativa, nenhuma em background/sem consumidores                   | Teste do gerenciador com sensor simulado                        |
| Amostras repetidas de orientação            | Nenhuma nova escrita de shared value                                            | Teste das quatro orientações e aliases                          |
| Carga de galeria cancelada no primeiro lote | Quatro consultas de URI iniciadas, zero leituras de notas, zero lotes seguintes | Teste de 100 fotos simuladas                                    |
| Processamento sem LUT                       | Remove uma cópia RGBA de largura × altura × 4 bytes                             | Cálculo: 27 MB (25,75 MiB) para 3000 × 2250; não RSS do app     |
| Canvas após conclusão/falha                 | 1 × 1, sem fonte de imagem/handlers retidos                                     | Teste do runtime com canvas simulado                            |
| Preview nativo                              | Próximo frame só é aceito após consumo pela fila principal                      | Inspeção de sincronização e compilação; sem FPS medido          |

Não foram medidos FPS, consumo energético, temperatura, pico de RSS, tempo de
captura ou inicialização no iPhone. Não há porcentagem de aceleração demonstrada.
Os bundles Hermes finais ficaram aproximadamente em 7,33 MB (iOS) e 7,32 MB
(Android); sem baseline equivalente de exportação, não representam redução.

## Testes, falhas e segunda revisão

- `npm run lint`: passou, zero erros e zero avisos. Os dois avisos iniciais
  foram resolvidos pela correção dos efeitos, sem desabilitar regras.
- `npm run typecheck`: passou.
- `npm test`: 118 testes passaram, zero falhas e zero skips: 50 utilitários
  existentes, 42 de Composition e 26 novos testes de performance/confiabilidade.
- `node --test tests/composition/*.test.js`: 42 passaram na linha de base;
  também integram a regressão final via npm test.
- `npm run test:focus-native`: passou fora do sandbox, cobrindo seleção,
  registro, escala, crop, 20 frames, cancelamento, exportação e limpeza.
- `bash scripts/check-heif-plus-native.sh`: passou fora do sandbox, cobrindo
  fila durável, RAW intacto, retries, LUT tetraédrica, grain determinístico,
  halation, HEIF10 e metadados sem perda.
- `xcrun swiftc -module-cache-path /tmp/komorebi-p3-cache
modules/shared/PhotoCatalogMetadata.swift scripts/checkDisplayP3.swift
-o /tmp/komorebi-check-p3 && /tmp/komorebi-check-p3`: passou; conversão dos
  pixels sRGB → P3, ICC, EXIF e orientação de JPEG/HEIC verificados.
- `/Users/fabiosantos/.cargo/bin/cargo test --offline --manifest-path
modules/camera-photographic-styles/rust/Cargo.toml --target-dir
/tmp/komorebi-rust-tests`: 178 passaram; dois diagnósticos locais já marcados
  `ignored` exigem fixtures externas. Nenhum teste foi desabilitado nesta tarefa.
- `npx expo export --platform ios --platform android --output-dir
/tmp/komorebi-audit-export-final`: passou para ambas as plataformas.
- Build Debug iOS sem assinatura: duas execuções concluíram com
  `BUILD SUCCEEDED` antes da orientação para deixar Xcodebuild com o usuário.
  A validação final assinada e em aparelho fica com o usuário, conforme pedido.
- `git diff --check`: passou.

As falhas iniciais de Focus/HEIF+ ocorreram antes das alterações, em Core Image
sem acesso ao Metal. A repetição fora do sandbox passou sem modificar testes.
A primeira tentativa de Xcode também não acessou os serviços/workspace no sandbox;
a execução com acesso ao Xcode passou. A chamada inicial a Cargo não estava no
PATH; o binário existente em `.cargo/bin` executou a suíte sem instalação.

O primeiro teste novo de TopBar revelou uma limitação do harness: JSX clássico
exigia um React global, mas o projeto usa o runtime automático. O harness foi
corrigido para o runtime automático; as assertions e o componente não foram
alterados para acomodar a falha.

A segunda revisão corrigiu o catch da WebView para não limpar uma requisição
nova quando o salvamento antigo falha. O teste reproduz a sequência de promises
fora de ordem. Não foram encontradas regressões nas verificações automatizadas
executadas; isso não comprova ausência de regressões no hardware.

## Pendências e próximas otimizações

O critério de sucesso integral ainda depende de validação funcional no aparelho.
Os testes de hooks usam adaptadores determinísticos; os de canvas usam objetos
simulados. Eles não executam Hermes, WKWebView, AVFoundation nem navegação real.
Os testes Swift de imagem rodam no Mac, não no sensor do iPhone. Não foi feito
perfil de Instruments ou comparação de fotografias reais antes/depois.

Pontos restantes, sem alteração arriscada nesta etapa:

1. Cancelamento cooperativo de MiniCPM: cancelar Scan invalida resultado e Vision,
   mas a inferência já iniciada pode continuar até retornar. O warmup iniciado
   também não é abortável. Unloading precisa respeitar o lock compartilhado com
   classificação de fotos; não basta zerar o engine numa notificação de memória.
2. Processamento de foto em base64/canvas continua caro. Crop JPEG, EXIF em JS,
   conversão de formato e catálogo fazem múltiplas leituras/encodes. Migrar para
   pipeline nativo único exige preservar JPEG/HEIF, P3, RAW, Live Photo, depth,
   metadados e originais; não foi feita essa substituição.
3. Controle explícito dos acelerômetros nativos de orientação ao parar sessões,
   auditoria com Thread Sanitizer dos flags compartilhados entre filas e
   cancelamento durante captura Live Photo/Retrato precisam de validação própria.
4. Interrupção/morte do processo da WebView e recuperação durável de fotos comuns
   continuam candidatos a reforço. HEIF+ já tem fila durável separada.
5. Eventos sucessivos da biblioteca ainda podem iniciar consultas de álbum
   concorrentes. O trabalho pesado obsoleto é interrompido, mas a API de Fotos não
   permite abortar uma consulta de URI já enviada; isso inclui possível iCloud.
6. O startup ainda aguarda reconciliação de álbuns e carrega todos os LUTs. Adiar
   isso exigiria garantir filtros prontos antes da captura e evitar sobrescrever
   preferências editadas durante a restauração.
7. Contexto de configurações, atualizações de histogramas/zebra e sliders manuais
   merecem perfil de renders/bridge antes de dividir componentes ou agrupar
   comandos. O React Compiler já está habilitado; não se adicionou memoização
   indiscriminada.
8. Avaliar otimização lossless do PNG de splash e dependências sem usos aparentes,
   verificando plugins/autolinking/patches antes de qualquer remoção.

## Roteiro de regressão física para o usuário

Executar no build final do Xcode, conforme combinado, e registrar aparelho/iOS.
Cada linha abaixo permanece **pendente**, não é resultado de teste executado.

| Área                     | Sequência                                                                                            | Aceitação                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Inicialização/permissões | Instalação existente e onboarding; negar/conceder permissões; retornar de Ajustes                    | Mesmos controles e preferências; câmera pronta sem travamento             |
| Lifecycle                | Abrir galeria/configurações e voltar 20 vezes; background, bloquear/desbloquear, Central de Controle | Câmera para fora da tela; retoma; botões físicos não disparam fora dela   |
| Captura padrão/manual    | Traseira/frontal, todas as lentes; ISO/shutter/WB/foco/EV; flash e sorriso                           | Preview e exposição corretos, sem disparos duplicados e sem perda de foto |
| Troca de modos           | Padrão → RAW → Live Photo → Retrato → Stacking → padrão, repetir após background                     | Sem duas sessões concorrentes, câmera preta ou espera permanente          |
| Efeitos                  | LUT de fábrica/customizado, grain isolado, halation isolado, combinações; capturas repetidas         | Cor/textura, crop, dimensões e EXIF iguais à referência; fila termina     |
| Formatos/metadados       | JPEG/HEIF/HEIF+, RAW simples/pareado, dupla captura, original e projetos                             | Todos os arquivos e variantes presentes; P3, GPS e metadados coerentes    |
| Native preview           | Efeitos em Live Photo/Retrato/Stacking; abrir painéis durante preview                                | UI fluida, sem acúmulo contínuo de frames; preview retoma                 |
| Scan                     | Iniciar, mover, receber moldura, alinhar, cancelar, reiniciar; sair durante captura/análise/tracking | Nenhum resultado/zoom antigo; novo Scan funciona; nada salvo pelo Scan    |
| Stacking                 | Noise/Night, Bulb/Motion Blur, dupla exposição e Focus 3/10/20; cancelar e background                | Cancelamento libera câmera e temporários; próxima captura funciona        |
| Galeria                  | Trocar projetos rapidamente durante carregamento; álbum vazio; notas; editar biblioteca e retornar   | Sem fotos/miniaturas do projeto anterior; notas e informações corretas    |
| Clima                    | Controle oculto/visível; negar GPS; alternar rapidamente e navegar                                   | Sem GPS/rede quando oculto; informação disponível quando habilitado       |
| Recursos                 | Instruments Allocations/Time Profiler/Energy, idle e 20 ciclos de cada fluxo                         | Registrar picos/retorno de memória, CPU/GPU e atividade em background     |

Comparação sugerida: usar o mesmo aparelho, build Release, temperatura inicial,
cena, lente e configurações. Comparar tempo até preview, latência de captura,
tempo de processamento, FPS e memória antes/depois. Não confundir aquecimento do
modelo ou caches com crescimento sustentado de memória. Preservar fotos de
referência para comparar cores, orientação, detalhes, metadados e Live Photo.

## Encerramento conforme orientação do usuário

O usuário pediu para deixar Xcodebuild para ele e depois solicitou **sem build**.
Nenhum novo build deve ser iniciado para esta entrega. O build Android em
andamento foi interrompido a pedido; não há APK final validado. Antes disso,
a tentativa offline falhou por ausência do plugin Gradle no cache; a tentativa
com rede chegou à compilação nativa. Não houve atualização de versões no projeto.
A entrega contém a auditoria e otimizações implementadas, 118 testes JS aprovados,
178 testes Rust aprovados, lint/typecheck aprovados e verificações nativas de
imagem aprovadas. A regressão física e os builds finais permanecem com o usuário.
