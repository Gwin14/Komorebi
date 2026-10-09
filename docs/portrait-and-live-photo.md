# Retrato e Live Photo

Atualizado em 9 de outubro de 2026 a partir da implementação do app.

## Captura no iOS

Os controles **Retrato** e **Live Photo** podem ficar ativos juntos quando a lente
informa `supportsLivePhotoCapture` no módulo `camera-portrait-capture`. Essa
capacidade é consultada para o dispositivo selecionado; suporte individual aos
dois modos não garante suporte combinado. RAW/ProRAW e Image Stacking continuam
bloqueando esses controles.

Com os dois ativos, o preview e a captura usam a sessão nativa de retrato.
`capturePortraitPhoto` recebe `livePhotoEnabled: true` e retorna a foto renderizada,
a original com auxiliares e `movieUri`. O processamento identifica essa captura
como `portraitLive`. Se faltar o vídeo, a captura falha explicitamente em vez de
salvar silenciosamente uma foto estática.

Ao trocar para uma lente que não oferece a combinação, o app desliga Live Photo
e mostra **Live indisponível com retrato nesta lente.** na TopBar. Ao sair de
Image Stacking, os modos anteriores são restaurados conforme as capacidades atuais.

## Preview e processamento

O preview de retrato mostra a cena sem simulação de desfoque. O slider disponível
é o de exposição; o controle de abertura foi removido da interface. A renderização
da foto capturada continua usando profundidade/matte, região de foco e abertura
inicial de f/4.5. Tocar para focar continua disponível.

O salvamento de Retrato + Live Photo preserva os auxiliares de profundidade/matte
da foto original na imagem processada e importa o vídeo pareado. Efeitos e
metadados seguem o pipeline da captura. O vídeo deve continuar reproduzível no
Fotos após o salvamento.

Estilos Fotográficos 2/3 ficam suspensos enquanto Live Photo estiver ativa,
inclusive nesta combinação. As preferências são conservadas e voltam a valer
ao sair do modo, conforme as demais regras de compatibilidade. Detalhes em
[Formatos de captura](capture-file-formats.md).

## Profundidade na galeria

Gerar profundidade depois da captura é um recurso separado do modo Retrato.
O módulo `camera-photo-depth` aceita Live Photos elegíveis e mantém seu vídeo
na edição ou na cópia. O compartilhamento da galeria exporta uma imagem estática.
Veja [Ações da galeria](gallery-actions.md) para original, cópia, reversão e
restrições de HEIF com Estilos Fotográficos.

## Validação

Recompile o app iOS para incluir as alterações Swift. Rode `npm run lint`,
`npm test` e `npm run typecheck` conforme a mudança. Os testes locais cobrem
contratos e integração do pipeline; não comprovam captura e reprodução no iPhone.

Em dispositivo físico:

1. Capturar Retrato sozinho, Live Photo sozinha e os dois juntos nas lentes compatíveis.
2. Conferir foco por toque, exposição, orientação e desfoque da foto final; o preview deve permanecer sem desfoque simulado.
3. Abrir no Fotos e conferir o vídeo, profundidade/matte e metadados, com e sem efeitos e cópia sem efeitos.
4. Trocar para lente sem suporte combinado e conferir aviso e desligamento de Live Photo.
5. Entrar e sair de Image Stacking; conferir restauração dos modos e bloqueios de RAW.
6. Ativar preferências de Styles 2/3 e confirmar a suspensão durante Live Photo e restauração depois.
7. Testar permissão de Fotos negada/limitada, interrupção e falha de captura sem deixar um asset parcial.

A compatibilidade dos controles de edição do Fotos depende do arquivo, aparelho
e sistema. Uma verificação estrutural não equivale a um teste de edição no iPhone.
