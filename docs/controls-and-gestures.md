# Controles e gestos

Em Configurações → Controles e gestos, os quatro atalhos são salvos em
`@settings/controlGestures`. Instalações anteriores mantêm LUTs no gesto vertical,
gesto horizontal desligado e disparo com timer geral nos dois botões de volume.

- Cima abre LUTs ou ativa o modo escolhido; baixo fecha/desativa apenas esse modo.
- Direita avança e esquerda volta um item, circulando na ordem do seletor.
- Volume pode disparar, usar timer de 3s/10s naquela foto ou navegar efeitos/lentes.
- Só lentes físicas da posição atual participam; recortes de zoom ficam de fora.
- Mudanças de modo, efeito e lente ficam bloqueadas durante captura/processamento/contagem.
- Finalizar Bulb/Motion Blur continua imediato, mesmo com um timer associado.

No iOS, o evento primário agrupa diminuir volume, Camera Control e botão de Ação
quando acionam captura. Aumentar volume usa o evento secundário. A associação do
grupo aparece na interface. Referência: https://developer.apple.com/videos/play/wwdc2025/253/.

No Android, o módulo CameraControlButton intercepta teclas no callback da janela
somente enquanto a câmera está ativa. Soltar a tecla gera um evento; repetições e
cancelamentos não geram disparos. Fora da câmera, o callback original é restaurado.
A integração não depende do nível de volume. A antiga escuta de mudanças de volume
foi removida para evitar eventos duplicados.

Os seletores de cada gesto e botão abrem como telas do Expo Router. O botão de
voltar retorna à página anterior, e escolher uma ação salva a preferência e volta
a Controles e gestos. Configurações e galeria compartilham o cabeçalho com o mesmo
BackButton das demais telas; o visualizador de fotos mantém suas transições.

## Verificação

Recompilar o app nativo para incluir o módulo Android; recarregar o JavaScript não
instala módulos nativos. Expo Go não oferece esta ponte de botões físicos.

Comandos: `npm run lint`, `npm run typecheck`, `npm test`.

Validar em aparelhos físicos iOS e Android:

1. Reiniciar o app e conferir preferências; testar padrões de instalação anterior.
2. Acionar cima/baixo repetidamente para LUTs, manual e cada estratégia disponível;
   conferir aviso com lente/modo incompatível e restauração ao sair de stacking.
3. Navegar LUTs (incluindo importados e sem efeito), halation e grão nos dois sentidos;
   verificar extremos, remoção de LUT importado e previews conforme suas preferências.
4. Testar os dois volumes no mínimo/máximo, cliques rápidos e tecla segurada;
   esperar uma ação por clique completo, sem mudanças no volume do sistema.
5. Configurar aumentar em 3s e diminuir em 10s, com timer geral diferente; conferir
   cancelamento, segundo quadro de dupla exposição e término de Bulb/Motion Blur.
6. Trocar lentes frontal/traseira e conferir apenas dispositivos físicos disponíveis,
   sem presets de recorte; com uma só lente, não reiniciar a sessão.
7. Durante contagem, captura e processamento, tentar mudar modos, efeitos e lentes;
   conferir bloqueio e manutenção do cancelamento e do término de exposição.
8. Conferir foco por toque, zoom por pinça, sliders e listas dos painéis;
   gesto cancelado por pinça não pode executar atalho.
9. Abrir configurações/galeria e enviar o app ao fundo; conferir retorno do volume
   do sistema e ausência de captura. No iPhone, testar também Camera Control/Ação.

Testes automatizados usam adaptadores de hooks/eventos. Eles não substituem a
validação de reconhecimento de gestos e botões físicos nos aparelhos.
