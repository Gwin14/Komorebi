# Ações da galeria

Abra uma foto e toque em **…** para acessar **Ações**: compartilhar a imagem atual, avaliar de 0 a 5 estrelas e consultar a disponibilidade de profundidade. **Informações** mantém os dados de captura, EXIF e localização. Apenas um painel pode ficar aberto.

Na grade, toque em **Selecionar** ou mantenha uma miniatura pressionada. Marque as fotos e escolha **Avaliar**, **Compartilhar** ou **Apagar**. Avaliar aplica a mesma nota ao lote; a estrela cortada remove a classificação. A exclusão remove os assets da biblioteca e de todos os álbuns, após confirmação. Profundidade não aparece nas ações em lote.

A seleção usa IDs da biblioteca e sobrevive à reordenação e à atualização das fotos. A galeria consulta todas as páginas do álbum em lotes de 100, com até quatro leituras nativas concorrentes. Trocar de projeto ou sair encerra a seleção. Avaliações confirmadas são removidas da seleção; falhas e itens pendentes continuam marcados para repetir a ação. Cancelar uma avaliação interrompe o lote entre fotos, preservando as gravações já concluídas.

O carregamento da grade não solicita downloads dos originais no iCloud. Quando uma representação local não estiver disponível, mantém o URI e o ID do PhotoKit; as ações preparam os recursos completos quando solicitadas.

## Compartilhamento

`react-native-share` abre uma única folha nativa para uma ou várias imagens. No iOS, `camera-photo-depth.exportCurrentPhoto` pede ao PhotoKit a representação atual em tamanho completo, incluindo edições externas e arquivos no iCloud. Live Photos são compartilhadas como imagem estática nesta ação. No Android, os URIs acessíveis são copiados para arquivos no cache. Nenhuma imagem é convertida em base64 no JavaScript.

Se qualquer preparação falhar, o lote não é compartilhado parcialmente. É possível cancelar entre preparações; fechar a folha nativa é um cancelamento normal. Os arquivos temporários permanecem até a folha encerrar e depois são removidos. É necessário recompilar o app após instalar a dependência e o novo módulo nativo.

## Profundidade local no iOS

O módulo `camera-photo-depth` contém o modelo oficial Apple **DepthAnythingV2SmallF16**, versão 2.0, release 2024-06, Apache 2.0. O pacote original tem aproximadamente 49,8 MB descompactado. A origem e os hashes SHA-256 ficam em `ios/Models/model-lock.json`; `scripts/verify-depth-model.rb` verifica os arquivos e integra uma fase de compilação do pod. Não há download no primeiro uso nem envio da foto a servidor.

O modelo recebe RGB 518 × 392. A inferência usa a imagem orientada para leitura; a disparidade é realinhada ao raster original antes de ser incorporada. A estimativa é relativa, sem distância física medida. O encoder usa o perfil nominal experimental `NominalPortraitRendererV1`, com geometria escalada e orientada para o raster da foto. Esse perfil é um conjunto de parâmetros do renderer; não é calibração medida da câmera da foto e não permite inferir distâncias físicas. A antiga fórmula de equivalência focal do EXIF foi removida após falha visual confirmada no teste V. A primeira versão aceita apenas JPEG/HEIC estáticos sem profundidade existente. RAW e Live Photos são inelegíveis; o Android não mostra a ação.

O mapa tem lado maior de até 768 pixels, alinhado à orientação EXIF, recebe suavização espacial e normalização em unidades relativas de renderização. O encoder produz geometria nominal de renderização, região central de foco, flag de retrato, abertura simulada e receita REND; preserva HDR gain maps compatíveis. A classificação de qualidade é do produtor, sem confiança de retrato ou precisão métrica inventada. Os parâmetros REND usam o preset experimental confirmado nas variantes U/W, sem os overrides heurísticos que não produziram efeito visual; consulte `photo-depth-device-analysis.md`. A atribuição da pesquisa MIT usada está em `modules/camera-photo-depth/THIRD_PARTY_NOTICES.txt`.

Uma edição PhotoKit mantém o mesmo asset, álbuns e original. A representação anterior é copiada antes do commit para Application Support, com um registro atômico por asset. A classificação atual é preservada. O marcador `app.komorebi.depth` identifica a edição e permanece após avaliações pelo Komorebi. **Reverter profundidade** restaura o arquivo anterior e reaplica a nota atual, sem reverter ao original da captura.

Uma edição externa que substitua esse marcador impede a reversão automática: ela poderia sobrescrever alterações posteriores. Dados de recuperação conflitantes são conservados. O registro preparado permite recuperar um commit seguido de interrupção antes da atualização do registro; uma edição revertida seguida de interrupção antes da limpeza também é reconhecida. Com acesso limitado à biblioteca, assets invisíveis não são presumidos apagados. Desinstalar o app remove os backups privados e essa recuperação específica.

### Validação de compatibilidade com o Fotos

**A geração está liberada em todas as configurações de compilação, por solicitação do usuário:** `PhotosPortraitCompatibility.generationEnabled` está em `true`. `validated` continua em `false`, pois os testes de inferência, alinhamento EXIF, incorporação de disparidade, metadados e recuperação não comprovam que o Fotos do iPhone oferecerá controles de retrato. O usuário confirmou ativação e ajuste em variantes de diagnóstico P e Q no iPhone e efeito visual correto em U/W; V, com a projeção EXIF, falhou. A amostra X do encoder completo também permitiu aplicar o efeito pelo editor, com resultado visual conferido. O botão de ativação inicial não apareceu nesse teste; a edição no mesmo asset e a reversão ainda estão em validação. A interface informa o caráter experimental sem impedir a geração.

Para validar, recompilar o app com essa alteração e usar fotos descartáveis JPEG e HEIC:

1. Registrar dispositivo, versão do iOS, versão do app e hash do modelo. Capturar a tela das informações da foto antes da edição.
2. Adicionar profundidade a uma foto da galeria e verificar que o ID e os álbuns não mudaram.
3. Abrir o mesmo asset no Fotos e confirmar o controle de desfoque de retrato. Se o botão Retrato não aparecer na visualização inicial, abrir Editar e ativar/aplicar o efeito pelo editor. Alterar a abertura e confirmar mudança visual; um mapa extra no arquivo não basta. Esse acesso pelo editor funcionou na amostra X; o botão inicial e o commit no mesmo asset ainda exigem teste.
4. Em outro asset, mudar a classificação no Komorebi, encerrar/reabrir o app e reverter profundidade. Confirmar a representação anterior, a nota atual e o original preservado.
5. Em outro asset, editar no Fotos depois da geração e confirmar que a reversão pelo Komorebi é bloqueada, preservando a edição externa.
6. Testar cancelamento antes da gravação, permissão limitada/negada, recurso no iCloud indisponível e falta de espaço. Confirmar que nenhuma dessas falhas substitui a foto.

Somente depois de registrar evidências de sucesso marcar `validated` como `true` e atualizar o teste correspondente. Se o Fotos não aceitar a edição sintética, documentar o resultado; não apresentar o mapa incorporado como comprovação de suporte ao ajuste de desfoque.

## Verificação

- `npm run lint`, `npm test`, `npm run typecheck`.
- `npm run test:depth-native`: checksums, recuperação persistente, interrupção, conflito externo, inferência nas oito orientações EXIF, incorporação de disparidade, preservação da nota e cancelamento. Executa no macOS com Xcode/Core ML; não substitui testes do Photos no iPhone.
- Executar `cd ios && pod install --no-repo-update` após adicionar arquivos Swift ao módulo; isso atualiza a lista de Sources do target CameraPhotoDepth. Depois recompilar iOS; no Android, recompilar para integrar RNShare.
- Em dispositivos físicos: seleção em álbuns com mais de 100 fotos, troca de projetos, acesso limitado, avaliação parcial/cancelada, compartilhamento individual/múltiplo/cancelado, exclusão confirmada/cancelada e remoção externa de uma foto aberta.
