# Komorebi

<img src="https://github.com/Gwin14/Komorebi/blob/main/assets/images/icone.png" width="220" alt="Ícone do Komorebi" />

**Komorebi** é um aplicativo de câmera feito com Expo, React Native e módulos nativos customizados. O projeto combina captura fotográfica, controles manuais, filtros LUT, metadados EXIF e uma galeria integrada pensada para quem gosta de fotografar com mais intenção.

O app é local-first: fotos, preferências e LUTs personalizados ficam no dispositivo. Integrações externas são usadas para clima, mapa, feedback, geração de EXIF Frame, download opcional do modelo do Scan e diagnósticos Sentry. O compartilhamento de diagnósticos começa ativado e pode ser desligado no onboarding beta ou em Configurações → Sobre.

## Principais recursos

- Captura de fotos com `react-native-vision-camera`.
- Alternância entre câmera traseira e frontal.
- Seleção de lentes físicas quando o aparelho oferece múltiplas câmeras.
- Flash, zoom por gesto de pinça e controle visual de zoom.
- Timer de 3/10 segundos pela TopBar e atalhos configuráveis de gestos e botões físicos.
- Controle de exposição e painel manual para ISO, obturador, balanço de branco e foco em dispositivos compatíveis.
- RAW/ProRAW em iOS compatível.
- Live Photo e modo retrato por módulos nativos iOS, inclusive juntos quando a lente oferece suporte.
- HEIF, JPEG, HEIF+ com revelação personalizada de RAW e pares RAW + foto processada.
- Image Stacking no iOS: Bulb, Motion Blur, Focus Bracketing e Dupla exposição.
- Grão, halation e controles de preview dos efeitos.
- Compatibilidade experimental com Estilos Fotográficos 2/3 no Fotos da Apple.
- Proporção vertical/horizontal e modo de captura dupla.
- Detecção de sorriso para disparo automático.
- Disparo pelo botão de volume e suporte ao Camera Control em iPhones compatíveis.
- Filtros LUT `.cube` incluídos no app.
- Importação de LUTs personalizados.
- Processamento assíncrono de fotos com preservação/aplicação de EXIF.
- Opção de salvar a foto original junto da versão com LUT.
- Gravação opcional de localização GPS nas fotos.
- Painel de clima/localidade usando a localização durante o uso.
- Galeria integrada com projetos, EXIF, mapa, classificação de 0–5 estrelas e ações em lote para avaliar, compartilhar e apagar.
- Geração local experimental de profundidade em JPEG/HEIC no iOS, incluindo Live Photos elegíveis.
- Autoria, direitos autorais, tags e nomes inteligentes nas novas capturas.
- Gerador de EXIF Frame via WebView.
- Configuração da TopBar, incluindo ordem, limite de controles e posição invertida.
- Scan de composição híbrido no iOS, combinando Apple Vision com MiniCPM-V local opcional.

## Status do projeto

O Komorebi está em desenvolvimento ativo. A base atual já usa Expo SDK 54, React 19, React Native 0.81, Vision Camera e módulos nativos locais para recursos avançados de câmera no iOS.

Algumas funcionalidades dependem de hardware real e permissões do sistema. Para validação confiável, use um dispositivo físico.

## Requisitos

- Node.js compatível com o ecossistema Expo atual.
- npm.
- Expo CLI/EAS conforme sua rotina de desenvolvimento.
- Xcode para iOS e Android Studio para Android, quando for rodar builds nativos.
- CMake 3.28 ou superior para preparar o runtime MiniCPM-V no iOS.
- Dispositivo físico para testar câmera, RAW/ProRAW, Live Photo, retrato, haptics, galeria, GPS, botão de volume e Camera Control.

Configuração nativa atual:

- iOS deployment target: `18.0`.
- Android `minSdkVersion`: `26`.
- Bundle iOS: `br.dev.fabiosantos.komorebi.app`.
- Package Android: `br.dev.fabiosantos.komorebi`.

## Como rodar

```bash
npm install
npm start
```

O projeto exige um build nativo de desenvolvimento; Expo Go não inclui os módulos locais. `npm start` inicia o Metro para esse binário. O alvo web serve para verificações parciais de interface; os recursos nativos dependem de iOS/Android.

Para executar em uma plataforma:

```bash
npm run ios
npm run android
npm run web
```

### Primeiro setup do Scan inteligente no iOS

O runtime MiniCPM-V é compilado localmente e não fica versionado no Git. Em cada Mac novo, depois de clonar o repositório, execute:

```bash
npm install
brew install cmake
npm run setup:minicpm-ios
npx pod-install ios
```

O primeiro `setup:minicpm-ios` pode demorar vários minutos e gera `modules/composition-scan/ios/Frameworks/llama.xcframework`. O script valida as variantes de iPhone e simulador, os headers e os símbolos de inferência. Se o framework já estiver válido, novas execuções terminam rapidamente sem recompilar. Use `npm run setup:minicpm-ios -- --force` somente quando precisar reconstruí-lo deliberadamente.

Depois, abra `ios/Komorebi.xcworkspace` no Xcode e instale um novo binário no aparelho. Uma atualização JavaScript não incorpora o runtime nativo.

No primeiro uso, abra **Configurações → Inteligência do Scan → Baixar modelo**. Os pesos do MiniCPM-V ocupam cerca de 1,6 GB, são baixados separadamente em cada aparelho e permanecem locais. A imagem analisada não é enviada para um servidor.

Em CI ou em outro computador usado para gerar Archive, execute os mesmos passos antes do build. O XCFramework gerado tem aproximadamente 349 MB e está no `.gitignore`. Detalhes e diagnóstico estão em [`docs/composition-scan.md`](docs/composition-scan.md).

Para lint:

```bash
npm run lint
```

## Permissões

O app usa as permissões abaixo:

- **Câmera:** preview e captura de fotos.
- **Biblioteca de mídia/Fotos:** salvar no álbum "Komorebi", carregar a galeria integrada, ler metadados e excluir fotos quando solicitado.
- **Localização durante o uso:** salvar GPS no EXIF quando ativado e buscar clima/localidade.
A câmera opera com áudio desativado. Os plugins de `expo-camera` e `expo-av` desabilitam a permissão de microfone; não há solicitação de microfone no fluxo fotográfico atual.

## Estrutura do projeto

```text
Komorebi/
├── app/
│   ├── components/          # Telas e componentes da UI
│   ├── context/             # SettingsContext e estado compartilhado
│   ├── docs/                # Termos de uso e política de privacidade
│   ├── hooks/               # Hooks de câmera, gestos, captura e sensores
│   ├── utils/               # EXIF, LUT, câmera, storage e helpers
│   ├── _layout.tsx          # Layout do Expo Router
│   └── index.jsx            # Tela principal da câmera
├── assets/
│   ├── images/              # Ícones, mockups e imagens de interface
│   ├── luts/                # LUTs .cube incluídos
│   └── sounds/              # Som de obturador
├── modules/
│   ├── camera-control-button/
│   ├── composition-scan/
│   ├── camera-live-photo/
│   ├── camera-image-stacking/
│   ├── camera-photographic-styles/
│   ├── camera-photo-depth/
│   ├── shared/              # Metadados e helpers Swift compartilhados
│   ├── camera-manual-controls/
│   ├── camera-portrait-capture/
│   └── camera-raw-capture/
├── plugins/                 # Config plugins do Expo
├── patches/                 # Patch-package
├── ios/                     # Projeto nativo iOS
├── android/                 # Projeto nativo Android
├── app.json
├── package.json
└── metro.config.js
```

## Módulos nativos locais

O projeto inclui módulos Expo locais em `modules/`:

- `camera-manual-controls`: controles manuais e foco no iOS.
- `camera-image-stacking`: captura e composição multiframes no iOS.
- `camera-photographic-styles`: contêiner HEIF compatível com edição experimental de estilos no Fotos.
- `camera-photo-depth`: inferência local de profundidade, edição/recuperação e exportação da representação atual no iOS.
- `camera-raw-capture`: detecção/alternância RAW e ProRAW.
- `camera-live-photo`: captura e salvamento de Live Photos.
- `camera-portrait-capture`: captura de retrato com dados de profundidade/matte quando disponíveis.
- `camera-control-button`: eventos de captura no iOS e interceptação de teclas de volume na câmera no Android.
- `composition-scan`: captura um frame reduzido e combina Apple Vision com análise semântica MiniCPM-V local.

Cada módulo mantém a API pública em `index.ts` e a implementação iOS em `ios/`. O módulo de botões também tem implementação em `android/`; helpers Swift comuns ficam em `modules/shared/`.

Para reconstruir o escritor Rust dos Estilos Fotográficos após alterar suas fontes, use `bash modules/camera-photographic-styles/build-ios.sh` com Rust, os targets iOS e Xcode instalados; depois atualize os Pods e recompile o app. O modelo de profundidade vem empacotado e é verificado por `scripts/verify-depth-model.rb` durante o build, sem download no primeiro uso.

## LUTs e processamento de imagem

Os LUTs incluídos ficam em `assets/luts/`:

- Guaraná
- Maracujá
- Mirtilo
- Pitaia
- Damasco
- Cinema
- Ameixa
- Banana

O catálogo é definido em `app/utils/lutCatalog.js`. Para adicionar um LUT embutido:

```javascript
{
  id: "meu-filtro",
  name: "Meu Filtro",
  file: require("../../assets/luts/meu-filtro.cube"),
}
```

LUTs personalizados podem ser importados pelo app nas configurações. O conteúdo do `.cube` é armazenado localmente para reutilização.

## Configurações salvas

As preferências são persistidas com AsyncStorage:

- estilo retrô do viewfinder;
- grade da câmera;
- som do obturador;
- salvar localização nas fotos;
- salvar cópia sem LUT;
- LUTs personalizados;
- primeira execução;
- posição invertida da TopBar;
- ordem/seleção dos controles da TopBar;
- gestos e ações dos botões físicos;
- formato de foto e parâmetros HEIF+;
- preview de efeitos, nível, histograma e zebras;
- Estilos Fotográficos, autoria, tags e nomes inteligentes;
- projetos e projeto ativo;
- compartilhamento de diagnósticos.

O timer geral é temporário: inicia desligado, é ajustado apenas pela TopBar e volta a zero quando o app entra em segundo plano. As ações de volume com timer próprio continuam salvas nas configurações de controles e gestos.

## Serviços externos usados

- **Open-Meteo:** dados meteorológicos.
- **BigDataCloud:** geocodificação reversa.
- **Leaflet, OpenStreetMap e unpkg:** mapa dentro da galeria.
- **Hugging Face:** download opcional dos pesos MiniCPM-V; a inferência ocorre no aparelho.
- **Sentry:** diagnósticos de erros e desempenho, conforme a preferência do usuário.
- **criador-de-exif-frame.onrender.com:** gerador de EXIF Frame em WebView.
- **Notion:** formulário de feedback.
- **GitHub, Instagram, Threads, YouTube e Foto Essência:** links externos.

Consulte `app/docs/politica-de-privacidade.md` e `app/docs/termos-de-uso.md` para o texto usado dentro do app.

## Scripts

```bash
npm start        # inicia o servidor Expo
npm run ios      # executa no iOS
npm run android  # executa no Android
npm run web      # executa o alvo web
npm run lint     # roda o Expo ESLint
npm test         # testes locais com node --test
npm run typecheck # checagem TypeScript
npm run test:focus-native # verificações nativas de Focus Bracketing
npm run test:depth-native # verificações nativas de profundidade (macOS/Xcode/Core ML)
npm run setup:minicpm-ios # prepara/valida o runtime local do Scan no iOS
```

## Validação recomendada

Antes de entregar mudanças, rode lint e, conforme o código alterado, testes e checagem de tipos:

```bash
npm run lint
npm test
npm run typecheck
```

As verificações nativas exigem macOS/Xcode. Testes locais não comprovam captura, permissões ou compatibilidade do Fotos em um iPhone.

Para alterações em câmera ou mídia, valide manualmente em dispositivo físico:

- captura padrão;
- LUT com e sem cópia original;
- RAW/ProRAW, Live Photo e retrato quando disponíveis;
- controles manuais;
- galeria e exclusão;
- GPS/EXIF e mapa;
- botão de volume/Camera Control;
- permissões negadas e concedidas.

## Documentação técnica

- [Controles, gestos e timer](docs/controls-and-gestures.md)
- [Formatos de captura e perfil de cor](docs/capture-file-formats.md)
- [HEIF+](docs/heif-plus.md)
- [Retrato e Live Photo](docs/portrait-and-live-photo.md)
- [Image Stacking](docs/image-stacking-engine.md)
- [Scan de composição](docs/composition-scan.md)
- [Ações da galeria e profundidade](docs/gallery-actions.md)
- [Autoria, classificação e palavras-chave](docs/photo-catalog-metadata.md)
- [Estilos Fotográficos](modules/camera-photographic-styles/README.md)
- [Diagnósticos Sentry](docs/sentry.md)
- [UIScene no prebuild](docs/uiscene-plugin-plan.md)

## Contribuindo

Contribuições são bem-vindas.

1. Faça um fork do projeto.
2. Crie uma branch para a mudança.
3. Faça commits focados, preferencialmente com prefixos como `feat:`, `fix:` ou `chore:`.
4. Rode lint e testes manuais relevantes.
5. Abra um Pull Request com resumo, plataformas testadas e imagens/gravações quando houver mudança visual.

## Licença

Este projeto está sob a Licença MIT. Consulte `LICENSE.txt`.

## Links

- [Repositório GitHub](https://github.com/Gwin14/Komorebi)
- [Gerador de EXIF Frame](https://criador-de-exif-frame.onrender.com)
- [Foto Essência](https://fotoessencia.fabiosantos.dev.br/)
- [Instagram @fotoessencia_](https://www.instagram.com/fotoessencia_/)
- [YouTube @FotoEssência](https://www.youtube.com/@FotoEssência)
