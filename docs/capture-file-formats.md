# Formatos de captura

O controle `rawCapture` da TopBar agora abre **Formato de arquivo**. O ID foi
mantido para preservar a posição e a ordem salvas nas configurações.

- Foto processada sem RAW: HEIF, HEIF+ ou JPEG conforme a escolha do usuário.
- RAW sem foto processada: somente DNG (ProRAW ou RAW Bayer, conforme a lente).
- RAW com foto processada: um único asset com DNG + HEIC para HEIF/HEIF+, ou
  DNG + JPEG quando JPEG está selecionado. HEIF+ preserva o HEIC da revelação
  personalizada, incluindo os efeitos; HEIF/JPEG usam o companion do formato
  selecionado retornado pela captura nativa.
- Desligar o último formato ativa o outro. Sem suporte a RAW, a foto processada
  permanece selecionada. Trocar de lente ou perder suporte a RAW também retorna
  à foto processada.

O DNG preserva a área do sensor. No par, a foto processada respeita a proporção selecionada.
RAW e a fonte RAW do HEIF+ usam resolução normal (aproximadamente 12 MP),
em vez de RAW Max de 48 MP. No iOS 16+, a captura pede uma dimensão suportada
pelo formato ativo e limitada pela saída, preservando a codificação DNG e a
profundidade de bits padrão do AVFoundation. O tamanho varia conforme a cena,
a lente e o tipo de RAW; não há uma meta fixa de MB.
O formato da sessão permanece em 4:3 e resolução fotográfica máxima ao usar
RAW, inclusive com controles manuais e análise/efeitos no preview. Algumas
lentes só expõem suporte a RAW nesse formato de sessão; selecionar um formato
de sessão de 12 MP pode remover esse suporte. A dimensão menor é solicitada
por foto, sem usar as capacidades resultantes para alternar entre formatos.
A captura dupla continua podendo gerar uma imagem alternativa. Ao suspender RAW
para Image Stacking, a seleção anterior é restaurada ao sair do modo.

O par é importado com dois originais: `.photo` para o DNG e `.alternatePhoto`
para o HEIC/JPEG, com os tipos de conteúdo explícitos. No iOS 27 também é usado
`originalResourceChoice = .raw`. Nas versões anteriores, a escolha do original
é controlada pelo Fotos; não usamos uma edição para tentar alterar essa escolha,
pois isso transformaria o HEIC/JPEG em uma revelação de um original RAW único.

Depois do salvamento, `PHAssetResource` deve conter exatamente dois originais,
um RAW e um HEIC/JPEG. O app valida esse resultado e registra os tipos e a ordem retornada pelo sistema
no log `[Komorebi RAW pair]`; no iOS 27 também verifica a escolha do DNG como
original. A preferência `.raw` é aplicada depois de adicionar os dois arquivos.
A ordem de uma lista externa e o texto do badge do Fotos são definidos por esses
apps e não substituem essa verificação dos recursos importados.

## Validação no iPhone

Recompilar o app iOS após a alteração do módulo nativo.
Em dispositivo físico com RAW, verificar:

1. HEIF sozinho, RAW sozinho e RAW + HEIF/HEIF+/JPEG.
2. Desligar cada formato sozinho e cada lado de um par; nunca ficar sem saída.
3. Confirmar um único item DNG + HEIC ou DNG + JPEG no Fotos e nos álbuns do app/projeto.
4. Conferir os efeitos da revelação HEIF+, localização, data e nomes inteligentes.
5. Proporções 4:3, 1:1 e 16:9, captura dupla e flash.
6. Alternar lentes, câmera frontal, Live Photo, Retrato e Image Stacking.
7. HEIF+ com interrupção/recuperação em background e biblioteca sem permissão.
8. Abrir com HEIF+ salvo, capturar imediatamente e alternar RAW/HEIF+/HEIF
   com e sem exposição manual e efeitos no preview; conferir feedback e captura
   sem precisar selecionar HEIF para destravar o shutter.
9. Conferir dimensões e tamanho do DNG em RAW e ProRAW, sozinho e em par;
   comparar com uma captura de 12 MP da mesma cena e lente em outro app.

Os testes de seleção, lint, TypeScript e verificações Swift não substituem essa
validação da captura e da apresentação do par no Fotos.

## Perfil de cor no iOS

HEIC e JPEG são exportados com perfil ICC Display P3, incluindo o companion do
RAW, Live Photos, Retrato e Image Stacking. HEIF+ já usa Display P3. A captura
solicita P3 D65 quando o formato da câmera oferece suporte. A conversão usa o
perfil de entrada para transformar os pixels, sem apenas renomear o perfil.
O EXIF deixa de declarar sRGB; o ICC descreve as cores do arquivo.

Os dados do sensor no DNG permanecem intactos. O thumbnail personalizado do DNG
usa renderização e attachment de cor P3; a codificação desse thumbnail precisa
ser conferida no iPhone. LUTs no WebView continuam trabalhando em sRGB; a
exportação final converte essas imagens para P3, mas não recupera cores que
já foram limitadas ao gamut sRGB durante o efeito.

Teste local da conversão, perfil gravado e orientação em JPEG/HEIC:

```sh
swiftc modules/shared/PhotoCatalogMetadata.swift scripts/checkDisplayP3.swift -o /tmp/check-display-p3
/tmp/check-display-p3
```

Depois de recompilar o iOS, capturar novas fotos com e sem efeitos e conferir
`ProfileName = Display P3` no Metapho para HEIC/JPEG. Fotos antigas não são
alteradas. Validar também cores, orientação, Live Photo e profundidade.
