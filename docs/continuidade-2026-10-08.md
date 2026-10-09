# Continuidade do trabalho — Komorebi

> Snapshot histórico de 8 de outubro, preservado para investigação. Não descreve o estado atual do workspace. A galeria já oferece aplicação na original ou criação de cópia e aceita Live Photos elegíveis; consulte [Ações da galeria](gallery-actions.md). Captura combinada e timer estão em [Retrato e Live Photo](portrait-and-live-photo.md) e [Controles e gestos](controls-and-gestures.md).

Atualizado em **8 de outubro de 2026**, horário de São Paulo. Este documento registra o ponto em que o chat terminou. Leia o código atual antes de editar: há alterações locais ainda não commitadas, incluindo trabalho que já existia antes desta conversa.

## Onde retomar

Os problemas ativos são:

1. **Profundidade / Palco Mono:** o usuário consegue aplicar e regular efeitos no Fotos em algumas amostras, mas a iluminação ainda preserva apenas uma parte clara do sujeito. Na última cena, uma mão sobre um tabuleiro, só alguns dedos e parte da mão ficam iluminados.
2. **Erro ao adicionar profundidade em uma foto do No Fusion:** aparece `PHPhotosErrorDomain error 3302` depois do progresso de geração. Foi corrigida uma incompatibilidade de orientação da saída PhotoKit, mas o usuário ainda não confirmou o salvamento no iPhone após a correção.
3. **Preview preto da câmera normal:** foi analisado um log de inicialização. A configuração nativa da VisionCamera parece ficar presa antes de iniciar a sessão; mudar para Live funciona, voltar à câmera normal continua preto. A operação exata que bloqueia ainda não foi identificada e não foi aplicada correção para esse problema.

**Última intervenção:** o usuário tentou compilar e recebeu `Cannot find 'PhotoDepthEditingImage' in scope` em `PhotoDepthService.swift`, linhas 161 e 204. Isso já foi corrigido no código local: o helper foi movido para `PhotoDepthEngine.swift`, arquivo que já está incluído no target dos Pods. Ainda não houve retorno do usuário sobre uma nova compilação no Xcode.

Não anunciar que o erro 3302 ou o Palco Mono foram resolvidos. Os testes locais comprovam estrutura e processamento; não comprovam aceitação ou renderização no Fotos do iPhone.

## Projeto e documentos importantes

Raiz: `/Users/fabiosantos/Documents/projetos-dev/Komorebi`.

App Expo/React Native com Expo Router. A implementação de profundidade é nativa em Swift, iOS, no módulo `modules/camera-photo-depth/`.

Leia estes arquivos:

- `AGENTS.md`: convenções do repositório e validação em dispositivos físicos.
- `docs/photo-depth-device-analysis.md`: histórico detalhado dos experimentos de profundidade e dos resultados informados pelo usuário. É a fonte principal para as variantes A–X; não repetir experimentos já rejeitados sem uma hipótese nova.
- `docs/gallery-actions.md`: ações individuais e em lote, compartilhamento, avaliação, profundidade e recuperação.
- `docs/photo-catalog-metadata.md`: XMP/IPTC, classificação e preservação dos recursos.
- `modules/camera-photo-depth/ios/PhotoDepthEngine.swift`: inferência, escrita do arquivo e, agora, o enum `PhotoDepthEditingImage`.
- `modules/camera-photo-depth/ios/PhotoDepthPortraitEncoding.swift`: geometria nominal, normalização do mapa, foco, metadados de retrato.
- `modules/camera-photo-depth/ios/PhotoDepthRenderingProfile.swift`: preset binário REND.
- `modules/camera-photo-depth/ios/PhotoDepthService.swift`: PhotoKit, adicionar, reverter, exportar e commit.
- `modules/camera-photo-depth/ios/PhotoDepthRecoveryStore.swift`: backup e reconciliação após interrupção/edição externa.
- `modules/camera-photo-depth/ios/PhotosPortraitCompatibility.swift`: geração habilitada, validação global ainda falsa.
- `scripts/check-photo-depth-native.sh` e `.swift`: testes nativos.

## Histórico de profundidade: o que já foi demonstrado

Este resumo vem do documento de análise existente no repositório; parte dos experimentos ocorreu antes deste chat.

- Acrescentar apenas um mapa de disparidade não foi suficiente para disponibilizar o editor de retrato do Fotos.
- Alterar isoladamente flags de retrato ou copiar somente REND/abertura não resolveu as primeiras variantes sintéticas.
- Na referência Fusion funcional, retirar o grupo de calibração rompeu a ativação. Retirar REND/abertura conservou alguns controles de iluminação, mas rompeu o ajuste de desfoque.
- A variante **K**, sem os quatro campos de distorção, ainda permitiu ativar e regular nessa referência. Isso não valida a geometria de qualquer foto.
- A variante **P**, que substituiu o mapa da referência funcional por um mapa Depth Anything da mesma captura, com faixa/resolução e demais recursos compatíveis, permitiu ativar e regular. Portanto o modelo não é, por si só, incompatível com o Fotos.
- **Q**, com geometria virtual estimada do EXIF, também permitiu ativar e regular naquele teste. Porém essa fórmula não foi confiável em outra cena.
- Repor cinco registros REND nas variantes **S/T** não corrigiu a falta de efeito visual.
- **U** era um controle Fusion; **V** trocava o grupo de geometria por projeção estimada do EXIF; **W** conservava geometria/receita da captura e substituía apenas o mapa por Depth Anything da mesma imagem.
- O usuário confirmou **U e W corretos** e **V incorreto**. Isso isola o grupo geométrico alterado em V como suficiente para causar a regressão naquela captura; não identifica um único campo culpado.
- A fórmula EXIF foi então substituída pelo perfil nominal experimental `NominalPortraitRendererV1`. Os overrides REND heurísticos foram retirados em favor do preset funcional.
- **X**, produzida pelo encoder completo atualizado, permitiu aplicar o efeito por **Editar** no Fotos e mostrou supressão real do fundo. O botão inicial de ativação não apareceu. Isso não validou todos os sujeitos, cenas ou o commit no mesmo asset.
- A última foto da mão confirma uma limitação visual ainda presente no Palco Mono, mesmo após esse progresso.

Não confundir uma imagem exportada depois da edição com o recurso original usado pelo renderer. Exportações podem perder região de foco, receita ou geometria. Não copiar calibração medida de uma captura e apresentá-la como calibração de outra.

## Estado atual do encoder

- Modelo empacotado: **DepthAnythingV2SmallF16**, versão 2.0 / release 2024-06, com hashes fixados em `Models/model-lock.json`.
- Inferência local; não envia fotos a servidor e não baixa o modelo no primeiro uso.
- Saída relativa de disparidade; não fornece distâncias físicas medidas.
- Lado maior do mapa até 768; suavização espacial Gaussian com raio 0,5; faixa de renderização nominal aproximadamente **0,01–1,3**.
- Perfil `NominalPortraitRendererV1`: matriz, PixelSize e distorção nominal escalados/orientados para o raster. É um preset experimental de renderização, não calibração medida da câmera.
- Foco central `(0.5, 0.5)`; região nominal ajustada para raster em pé/deitado.
- Abertura simulada inicial `2.0`; intensidade inicial de iluminação `0.480556`; receita REND fixa em `PhotoDepthRenderingProfile`.
- Preserva regiões não Focus e substitui o foco anterior; preserva HDR e auxiliares compatíveis.
- `generationEnabled = true`, `validated = false`. Não desabilitar a geração só por ainda ser experimental: o histórico registra que o usuário quer mantê-la disponível.
- Aceita JPEG/HEIC estáticos sem profundidade existente; RAW e Live Photos são inelegíveis; Android não oferece essa ação.

O preset nominal e o foco/iluminação fixos são candidatos à investigação do Palco Mono, mas **não há diagnóstico causal fechado nem correção visual validada para a mão**.

## Últimas fotos e análise confirmada

Os arquivos foram inicialmente mencionados em Downloads e depois movidos para `.Trash`. As cópias usadas na análise foram preservadas em:

`/private/tmp/komorebi-depth-1008/`

| Arquivo local | Conteúdo |
| --- | --- |
| `komorebi.heic` | Cópia de `manao-com-chess-pazo-sobre-mesa_20261008-090653.heic`, já com Palco Mono aplicado |
| `fusion.heic` | Cópia de `NO_FUSION_1008_001.HEIC`, colorida e sem profundidade |
| `fusion-upright.heic` | No Fusion normalizada para orientação up, antes da inferência |
| `fusion-generated.heic` | No Fusion com profundidade gerada localmente pelo fluxo corrigido |
| `komorebi.png`, `komorebi-map.png` | Prévia e mapa decodificados da Komorebi |
| `fusion.png`, `fusion-generated.png`, `fusion-generated-map.png` | Prévias da reprodução |
| `inspect.swift`, `generate.swift` | Scripts temporários usados na análise; revisar antes de reutilizar |

São arquivos temporários, sujeitos a limpeza. Conferir sua existência e preservar novas amostras antes de decodificar. Não adicionar mídia gerada ao Git.

**Komorebi:** imagem principal 3024 × 4032, orientação 1; disparidade 576 × 768, orientação 1; calibração nominal reconhecida por AVDepthData; Quality high / Filtered True. O mapa acompanha mão, dedos, tabuleiro e peças: não é uniforme nem globalmente invertido. Intervalo decodificado 0,010002136–1,2949218; mediana 0,070495605; centro 0,5341797. A prévia confirma que só parte da mão fica iluminada.

**No Fusion:** imagem 4032 × 3024, orientação 6; HDR gain map 2016 × 1512; nenhum auxiliar de profundidade. Não é uma referência do mapa ou da iluminação produzidos pelo Fusion. As duas fotos são capturas diferentes da mesma cena, com pequeno deslocamento de enquadramento.

**Reprodução corrigida:** 3024 × 4032, orientação 1; disparidade 576 × 768; HDR gain map 1512 × 2016; Display P3, EXIF e headroom 4,807737 preservados. A imagem continua colorida; o efeito de retrato/Palco deve ser testado no Fotos. Importar essa cópia **não testa o commit no asset original**.

## Erro PhotoKit 3302 e correção aplicada

O usuário confirmou que o erro surge **depois do progresso**, ao tentar adicionar profundidade à foto do No Fusion. A tela mostra `PHPhotosErrorDomain error 3302`. No SDK Apple, 3302 é `PHPhotosErrorInvalidResource`: falha na validação do recurso, sem identificar sozinho a propriedade rejeitada.

Foi encontrado um problema concreto: o fluxo mantinha orientação EXIF 6 na saída editada. A [documentação de PHContentEditingOutput](https://developer.apple.com/documentation/photos/phcontenteditingoutput/renderedcontenturl) exige pixels já orientados e metadados up. Isso foi corrigido, mas **a relação causal com esse 3302 e a aceitação do novo commit ainda precisam de reteste no iPhone**.

O helper `PhotoDepthEditingImage`:

- Está **dentro de `PhotoDepthEngine.swift`**, a partir de aproximadamente linha 165. Não existe mais um arquivo separado `PhotoDepthEditingImage.swift`.
- Normaliza os pixels antes da inferência, conservando resolução e perfil de cor.
- Gira amostras auxiliares HDR/mattes sem interpolar seus valores e remove padding de linha.
- Ajusta regiões XMP normalizadas e dimensões para o raster orientado.
- Falha explicitamente para layouts auxiliares não suportados; não descarta HDR silenciosamente.
- Pode recomprimir a imagem principal durante a normalização.

`PhotoDepthService.add` usa a fonte normalizada para inferência/escrita; prepara o backup original antes disso. `revert` também gera saída orientada para PhotoKit, mantendo o backup original intacto e reaplicando a classificação atual.

Novos logs:

```text
[PhotoDepth] commit prepared dimensions=... orientation=...
[PhotoDepth] commit failed domain=... code=... underlying=...
```

Se o erro persistir, usar esses logs completos para investigar o commit, sem presumir que o modelo falhou.

### Erro de compilação do helper: já corrigido

O primeiro patch criou um arquivo Swift separado. `CameraPhotoDepth.podspec` usa `**/*.swift`, mas o projeto dos Pods já gerado não passou a incluir o arquivo automaticamente. A verificação direta Swift recebeu o arquivo explicitamente e não detectou essa diferença de inclusão do target.

Depois do erro informado pelo usuário, o enum foi movido para `PhotoDepthEngine.swift`, que já consta nas Sources do pod. O arquivo separado foi removido, assim como sua entrada em `scripts/check-photo-depth-native.sh`. Não recriar esse arquivo sem atualizar a integração dos Pods. A última orientação ao usuário foi compilar novamente, sem precisar reinstalar os Pods por essa mudança.

## Testes e limites da validação

Nesta conversa passaram:

- `npm run lint`.
- Verificação Swift com SDK iOS, target `arm64-apple-ios17.0`, incluindo engine, encoder, service, recuperação e metadata compartilhada.
- `bash scripts/check-photo-depth-native.sh`: oito orientações EXIF, aparência dos pixels normalizados, espelhamento/rotação/padding de auxiliares, regiões de rosto, inferência, profundidade incorporada, classificação, recuperação e cancelamento.
- Decodificação real dos dois HEICs e reprodução local na foto No Fusion.
- `git diff --check`.

Após mover o helper para o arquivo existente, foram repetidos lint e a verificação Swift iOS, com sucesso. A suíte nativa completa passou antes da mudança de localização do enum; não foi repetida depois dessa mudança puramente organizacional.

A execução de Core ML/ImageIO no macOS precisou de acesso fora do sandbox: dentro dele houve falha na criação do diretório temporário do runtime. A execução autorizada passou. Essa falha local de sandbox não é o erro PhotoKit do iPhone.

**Não foi compilado/instalado o aplicativo completo pelo agente.** O usuário tentou compilar e reportou o erro de inclusão do helper, agora corrigido no código. Ainda falta confirmação da nova compilação e dos fluxos reais: adicionar, editar no Fotos, avaliar, reiniciar, reverter e lidar com edição externa.

O documento histórico cita 196 testes JS aprovados numa etapa anterior. Não apresentar esse número como uma execução nova deste chat.

## Preview preto: investigação separada ainda aberta

Log original disponível no momento da escrita:

`/Users/fabiosantos/.codex/attachments/8238277b-72b2-4cc1-b248-e1fe2afa978b/Texto colado.txt`

Em 7 de outubro, o usuário informou preview preto ao abrir a câmera normal. Mudar para Live funciona; voltar continua preto.

- Às 20:02:34 a VisionCamera configura input, outputs e formato 8064 × 6048 / vídeo 4032 × 3024 @30; o último log de configuração detalhado é `Photo RAW support...`.
- Não aparecem os callbacks de inicialização/início do preview esperados depois dessa etapa.
- Ao voltar do Live, às 20:03:03, uma nova configuração registra `Waiting for lock...`, sem avançar.
- O Live usa outra sessão e chega a `running=true`.

Hipótese sustentada: a fila serial de configuração da VisionCamera continua ocupada pela operação anterior. O log não identifica se o bloqueio ocorreu em side props, zoom, exposição, commit da sessão ou outra etapa posterior ao último registro. Não declarar um deadlock específico como confirmado.

Arquivos examinados: `app/components/CameraPreview.jsx`, hooks de câmera/controles manuais, implementações nativas e `patches/react-native-vision-camera+4.7.3.patch`. O patch altera configuração de outputs/RAW/Live/P3 e momento de `onSessionInitialized`. Não houve mudança para corrigir ou instrumentar esse problema nesta conversa. Se retomar, acrescentar registros antes/depois das etapas suspeitas e persistir a instrumentação no patch da dependência, não somente em `node_modules`.

## Estado do workspace: preservar trabalho existente

Há modificações locais prévias na galeria, estilos, leitura de fotos, metadados compartilhados, dependências e testes. O módulo `camera-photo-depth`, documentos e vários arquivos das ações da galeria ainda aparecem como não rastreados. **Não usar reset/checkout para limpar esses arquivos e não atribuir todas as alterações ao último chat.**

As ações de galeria descritas na documentação incluem compartilhamento da representação atual, avaliações individuais/em lote, seleção por IDs, profundidade individual e recuperação. Não reimplementar isso sem conferir o código.

Nenhum commit ou PR foi criado nesta conversa. Consultar `git status --short` no início do novo chat; o estado pode ter mudado desde este snapshot.

## Próximos passos sugeridos

1. Confirmar com o usuário o resultado da nova compilação após o helper ter sido movido.
2. Retestar adicionar profundidade à foto No Fusion no **asset existente**. Se falhar, obter os logs `[PhotoDepth]` e distinguir erro de obtenção do recurso, escrita e commit.
3. Validar reversão com orientação 6, nota atual, reinício e edição externa. Não alterar `validated` para true antes das verificações físicas.
4. Para Palco Mono, obter o original colorido da foto Komorebi e, se disponível, uma referência Fusion da mesma captura antes do efeito. Comparar mudanças controladas de foco/receita/geometria, sem repetir ajustes aleatórios de metadados.
5. Retomar a instrumentação do preview preto quando esse problema voltar a ser prioridade; ele é independente da edição de profundidade da galeria.

## Texto para iniciar o novo chat

> Leia `docs/continuidade-2026-10-08.md` e `docs/photo-depth-device-analysis.md` e confira o código atual antes de continuar. Quero retomar a profundidade da galeria: Palco Mono ainda ilumina só parte do sujeito e o No Fusion apresentou erro PhotoKit 3302 depois da geração. A normalização de orientação foi implementada, e o erro de compilação do helper foi corrigido movendo `PhotoDepthEditingImage` para `PhotoDepthEngine.swift`. Confirme o resultado do meu reteste antes de considerar o problema resolvido. Preserve as alterações locais e não repita experimentos já descartados. O preview preto da VisionCamera também permanece pendente, como investigação separada.
