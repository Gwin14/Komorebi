# Komorebi

<img src="https://github.com/Gwin14/Komorebi/blob/main/assets/images/icone.png" width="220" alt="Ícone do Komorebi" />

**Komorebi** é um aplicativo de câmera feito com Expo, React Native e módulos nativos customizados. O projeto combina captura fotográfica, controles manuais, filtros LUT, metadados EXIF e uma galeria integrada pensada para quem gosta de fotografar com mais intenção.

O app é local-first: fotos, preferências e LUTs personalizados ficam no dispositivo. Integrações externas são usadas apenas para funções específicas, como clima, mapa, feedback e geração de EXIF Frame.

## Principais recursos

- Captura de fotos com `react-native-vision-camera`.
- Alternância entre câmera traseira e frontal.
- Seleção de lentes físicas quando o aparelho oferece múltiplas câmeras.
- Flash, zoom por gesto de pinça e controle visual de zoom.
- Controle de exposição e painel manual para ISO, obturador, balanço de branco e foco em dispositivos compatíveis.
- RAW/ProRAW em iOS compatível.
- Live Photo e modo retrato por módulos nativos iOS.
- Proporção vertical/horizontal e modo de captura dupla.
- Detecção de sorriso para disparo automático.
- Disparo pelo botão de volume e suporte ao Camera Control em iPhones compatíveis.
- Filtros LUT `.cube` incluídos no app.
- Importação de LUTs personalizados.
- Processamento assíncrono de fotos com preservação/aplicação de EXIF.
- Opção de salvar a foto original junto da versão com LUT.
- Gravação opcional de localização GPS nas fotos.
- Painel de clima/localidade usando a localização durante o uso.
- Galeria integrada com leitura de EXIF, badges do Komorebi, mapa e exclusão de fotos.
- Gerador de EXIF Frame via WebView.
- Configuração da TopBar, incluindo ordem, limite de controles e posição invertida.

## Status do projeto

O Komorebi está em desenvolvimento ativo. A base atual já usa Expo SDK 54, React 19, React Native 0.81, Vision Camera e módulos nativos locais para recursos avançados de câmera no iOS.

Algumas funcionalidades dependem de hardware real e permissões do sistema. Para validação confiável, use um dispositivo físico.

## Requisitos

- Node.js compatível com o ecossistema Expo atual.
- npm.
- Expo CLI/EAS conforme sua rotina de desenvolvimento.
- Xcode para iOS e Android Studio para Android, quando for rodar builds nativos.
- Dispositivo físico para testar câmera, RAW/ProRAW, Live Photo, retrato, haptics, galeria, GPS, botão de volume e Camera Control.

Configuração nativa atual:

- iOS deployment target: `18.0`.
- Android `minSdkVersion`: `26`.
- Bundle/package: `br.dev.fabiosantos.komorebi`.

## Como rodar

```bash
npm install
npm start
```

Para executar em uma plataforma:

```bash
npm run ios
npm run android
npm run web
```

Para lint:

```bash
npm run lint
```

## Permissões

O app usa as permissões abaixo:

- **Câmera:** preview e captura de fotos.
- **Biblioteca de mídia/Fotos:** salvar no álbum "Komorebi", carregar a galeria integrada, ler metadados e excluir fotos quando solicitado.
- **Localização durante o uso:** salvar GPS no EXIF quando ativado e buscar clima/localidade.
- **Microfone:** declarado na configuração nativa para compatibilidade de câmera/vídeo, embora o app atual seja focado em fotografia.

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
│   ├── camera-live-photo/
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
- `camera-raw-capture`: detecção/alternância RAW e ProRAW.
- `camera-live-photo`: captura e salvamento de Live Photos.
- `camera-portrait-capture`: captura de retrato com dados de profundidade/matte quando disponíveis.
- `camera-control-button`: listener para o Camera Control de iPhones compatíveis.

Cada módulo mantém a API pública em `index.ts` e a implementação iOS em `ios/`.

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
- ordem/seleção dos controles da TopBar.

## Serviços externos usados

- **Open-Meteo:** dados meteorológicos.
- **BigDataCloud:** geocodificação reversa.
- **Leaflet, Carto basemaps e unpkg:** mapa dentro da galeria.
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
```

## Validação recomendada

Antes de entregar mudanças, rode:

```bash
npm run lint
```

Para alterações em câmera ou mídia, valide manualmente em dispositivo físico:

- captura padrão;
- LUT com e sem cópia original;
- RAW/ProRAW, Live Photo e retrato quando disponíveis;
- controles manuais;
- galeria e exclusão;
- GPS/EXIF e mapa;
- botão de volume/Camera Control;
- permissões negadas e concedidas.

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
