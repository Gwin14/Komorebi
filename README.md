# 📷 Komorebi

<img src="https://github.com/Gwin14/Komorebi/blob/main/assets/images/icone.png" width="300" />

Um aplicativo de câmera moderno e minimalista desenvolvido com React Native e Expo, com controles intuitivos, interface elegante e processamento avançado de imagens com filtros LUT.

## ✨ Características

- 📸 Captura de fotos em alta qualidade com metadados EXIF completos
- 🔄 Alternância entre câmera frontal e traseira
- ⚡ Controle de flash (ligado/desligado)
- 🎯 Controle de zoom com dial interativo e gestos pinch
- 🎨 Filtros cinematográficos com tecnologia LUT (Look-Up Table)
- 📍 Geolocalização GPS nas fotos (opcional)
- 🔊 Som de obturador customizável
- 💾 Salvamento automático em álbum dedicado "Komorebi"
- 🖼️ Galeria integrada com visualização de metadados EXIF
- 🗺️ Mapa interativo mostrando localização das fotos
- 🎨 Interface moderna com animações fluidas e feedback háptico
- 📱 Suporte para iOS e Android

## 🎮 Funcionalidades Principais

### Sistema de Filtros LUT
O app possui um sistema profissional de filtros baseado em LUTs:
- **Dark Gold**: Tom cinematográfico quente e vintage
- **Wes Anderson**: Paleta de cores inspirada no diretor
- **Cinema**: Look profissional de cinema
- Processamento de imagem com interpolação tetrahedral
- Preservação de metadados EXIF após aplicação de filtros
- Conversão de espaço de cores sRGB/Linear para precisão

### Controle de Zoom Avançado
- **Dial interativo**: Controle preciso através de gestos de arrastar
- **Gestos pinch**: Zoom intuitivo com dois dedos
- **Feedback háptico**: Vibração diferenciada em marcações principais
- **Indicador visual**: 51 linhas com escala dinâmica
- Animações suaves e responsivas

### Sistema de Metadados EXIF Completo
Salvamento automático de:
- Data e hora da captura
- Configurações da câmera (ISO, abertura, velocidade)
- Informações de exposição e compensação
- Distância focal e modelo de lente
- Coordenadas GPS (latitude, longitude, altitude)
- Orientação da imagem
- Espaço de cores e resolução

### Galeria Integrada
- Visualização de fotos do álbum Komorebi
- Grade de miniaturas 3x3
- Modal de visualização com informações detalhadas
- Exibição de todos os metadados EXIF
- Mapa interativo com Leaflet.js mostrando localização
- Interface dark mode elegante

## 🚀 Começando

### Pré-requisitos

- Node.js (v14 ou superior)
- npm ou yarn
- Expo CLI
- Dispositivo físico ou emulador iOS/Android

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/Gwin14/Komorebi
cd Komorebi
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o projeto:
```bash
npm start
```

4. Execute no dispositivo:
```bash
# Para Android
npm run android

# Para iOS
npm run ios
```

## 📱 Permissões Necessárias

O aplicativo requer as seguintes permissões:
- **Câmera**: Para capturar fotos
- **Microfone**: Para gravação de áudio
- **Galeria/Media Library**: Para salvar fotos capturadas
- **Localização**: Para adicionar coordenadas GPS às fotos (opcional)

As permissões são solicitadas automaticamente na primeira execução.

## 🛠️ Tecnologias Utilizadas

### Core
- **React Native** (0.81.4) - Framework principal
- **Expo** (~54.0.10) - Plataforma de desenvolvimento
- **TypeScript** (~5.9.2) - Tipagem estática

### Câmera e Mídia
- **expo-camera** (~17.0.10) - API de câmera
- **expo-media-library** (^18.2.0) - Gerenciamento de mídia
- **expo-image-manipulator** (~14.0.7) - Manipulação de imagens
- **expo-file-system** (~19.0.19) - Sistema de arquivos

### UI/UX
- **expo-haptics** (~15.0.7) - Feedback tátil
- **react-native-reanimated** (~4.1.1) - Animações performáticas
- **react-native-gesture-handler** (~2.28.0) - Gestos avançados
- **@expo/vector-icons** - Ícones da interface

### Sensores e Localização
- **expo-sensors** (^15.0.8) - Acelerômetro e giroscópio
- **expo-location** (^19.0.8) - GPS e geolocalização

### Processamento de Imagem
- **piexifjs** (^1.0.6) - Manipulação de metadados EXIF
- **react-native-webview** (^13.16.0) - Processamento LUT via Canvas API

### Mapas e Visualização
- **react-native-maps** (^1.26.20) - Mapas nativos
- **Leaflet.js** (via WebView) - Mapas web interativos

### Áudio
- **expo-av** (^16.0.8) - Sistema de áudio

## 📂 Estrutura do Projeto

```
Komorebi/
├── app/
│   ├── components/
│   │   ├── BackButton.jsx           # Botão de navegação
│   │   ├── BottomControls.jsx       # Controles inferiores da câmera
│   │   ├── CameraPreview.jsx        # Preview da câmera
│   │   ├── CustoToggle.jsx          # Toggle customizado
│   │   ├── ExifFrame.jsx            # Frame para geração de EXIF
│   │   ├── ExifItem.jsx             # Item de metadado EXIF
│   │   ├── ExposureDialFinal.jsx    # Dial de controle de zoom
│   │   ├── ExternalLink.jsx         # Links externos
│   │   ├── Feedback.jsx             # Página de feedback
│   │   ├── Galery.jsx               # Galeria de fotos
│   │   ├── LoadingScreen.jsx        # Tela de carregamento
│   │   ├── LUTSelector.jsx          # Seletor de filtros LUT
│   │   ├── MapViewWeb.jsx           # Mapa web com Leaflet
│   │   ├── Settings.jsx             # Página de configurações
│   │   ├── shutter.jsx              # Botão de captura
│   │   └── TopBar.jsx               # Barra superior
│   ├── context/
│   │   └── SettingsContext.js       # Contexto de configurações
│   ├── hooks/
│   │   └── useDeviceOrientation.js  # Hook de orientação
│   ├── utils/
│   │   ├── cameraUtils.js           # Utilitários da câmera
│   │   ├── exifFormatter.js         # Formatação de EXIF
│   │   ├── exifSchema.js            # Schema de metadados
│   │   ├── lutProcessor.js          # Processamento de filtros LUT
│   │   └── useShutterSound.js       # Hook de som de obturador
│   ├── _layout.tsx                  # Layout principal
│   └── index.jsx                    # Tela principal da câmera
├── assets/
│   ├── images/                      # Imagens e ícones
│   ├── luts/                        # Arquivos de filtros .CUBE
│   └── sounds/                      # Sons do app
├── app.json                         # Configurações do Expo
├── metro.config.js                  # Config do Metro (suporte .CUBE)
└── package.json                     # Dependências do projeto
```

## 🎯 Componentes Principais

### LUTProcessor
Sistema completo de processamento de filtros cinematográficos:
- Carregamento e cache de arquivos .CUBE
- Interpolação tetrahedral para precisão de cores
- Processamento via WebView com Canvas API
- Conversão sRGB ↔ Linear
- Preservação de metadados EXIF
- Processamento em background para não bloquear a UI

### Dial de zoom
Dial interativo para controle de zoom com:
- 51 linhas de marcação (incrementos de 15px)
- Escala dinâmica baseada na distância do centro
- Feedback háptico diferenciado para marcações principais (a cada 5) e secundárias
- Suporte a gestos Pan Responder
- Animação spring para ajuste final

### CameraPreview
Componente de preview com:
- Suporte a estilo retrô com bordas arredondadas
- Grade de composição fotográfica opcional
- Controle de zoom, flash e orientação
- Captura com metadados EXIF completos

### Galery
Galeria completa com:
- Grid 3x3 de fotos do álbum Komorebi
- Modal de visualização em tela cheia
- Exibição de 9+ campos EXIF
- Mapa interativo Leaflet.js com marcador customizado
- Conversão de coordenadas GPS para formato legível

### Settings
Página de configurações com:
- Toggle de estilo retrô do viewfinder
- Toggle de grade da câmera
- Toggle de som do obturador
- Toggle de salvamento de localização
- Links para redes sociais
- Link para gerador de EXIF Frame
- Link para página de feedback

## 🎨 Personalização

### Cores do Tema
As principais cores podem ser ajustadas nos arquivos de estilo:
- Accent color: `#ffaa00` (laranja/âmbar)
- Background: `#000` (preto absoluto)
- Text primary: `#fff` (branco)
- Text secondary: `#aaa` (cinza claro)
- Borders: `#444` e `#555` (cinza escuro)

### Configurações Salvas (AsyncStorage)
O app salva automaticamente as preferências:
- Estilo retrô do viewfinder
- Visibilidade da grade
- Som do obturador
- Salvamento de localização

### Adicionando Novos Filtros LUT
1. Adicione o arquivo `.CUBE` em `assets/luts/`
2. Registre em `AVAILABLE_LUTS` no arquivo `lutProcessor.js`:
```javascript
{
  id: "meu-filtro",
  name: "Meu Filtro",
  file: require("../../assets/luts/meu-filtro.CUBE"),
}
```

### Configurações da Câmera
No arquivo `app.json`, você pode personalizar:
- Mensagens de permissão
- Ícones e splash screen
- Configurações de build para iOS/Android
- Bundle identifiers

## 📝 Scripts Disponíveis

```bash
npm start          # Inicia o servidor de desenvolvimento
npm run android    # Executa no Android
npm run ios        # Executa no iOS
npm run web        # Executa na web
npm run lint       # Executa o linter ESLint
```

## 🔧 Recursos Avançados

### Sistema de Orientação
- Detecção automática de orientação via `DeviceMotion`
- Rotação animada de ícones da interface
- Mantém usabilidade em qualquer orientação

### Processamento Assíncrono
- Fila de processamento de imagens
- Não bloqueia a captura de novas fotos
- Processamento em background via WebView

### Gestão de Álbum
- Criação automática do álbum "Komorebi"
- Organização centralizada de fotos
- Compatibilidade com galeria nativa

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
1. Fazer fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abrir um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🔗 Links Úteis

- [Repositório GitHub](https://github.com/Gwin14/Komorebi)
- [Gerador de EXIF Frame](https://criador-de-exif-frame.onrender.com)
- [Instagram @fotoessencia_](https://www.instagram.com/fotoessencia_/)
- [YouTube @FotoEssência](https://www.youtube.com/@FotoEssência)

## ⚠️ Notas Importantes

- Este aplicativo requer um **dispositivo físico** para melhor experiência
- Emuladores podem ter limitações com recursos de câmera e feedback háptico
- O processamento de filtros LUT pode levar alguns segundos dependendo do dispositivo
- Recomenda-se testar em dispositivos reais para avaliar performance
- A localização GPS requer permissão do usuário e pode drenar bateria

---

**Desenvolvido com ❤️ usando React Native e Expo**
