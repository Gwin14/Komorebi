# 📷 Komorebi

<img src="https://github.com/Gwin14/Komorebi/blob/main/assets/images/icone.png" width="300" />

Um aplicativo de câmera moderno e minimalista desenvolvido com React Native e Expo, com controles intuitivos e interface elegante.

## ✨ Características

- 📸 Captura de fotos em alta qualidade
- 🔄 Alternância entre câmera frontal e traseira
- ⚡ Controle de flash (ligado/desligado)
- 🎯 Controle de zoom com dial interativo e feedback háptico
- 💾 Salvamento automático na galeria
- 🎨 Interface moderna com animações fluidas
- 📱 Suporte para iOS e Android

## 🎮 Funcionalidades Principais

### Controle de Zoom Interativo
O app possui um dial de zoom único que oferece:
- Controle preciso de zoom através de gestos de arrastar
- Feedback háptico ao ajustar o zoom
- Animações suaves e responsivas
- Indicador visual com linhas que aumentam conforme a proximidade do centro

### Interface Animada
- Transições suaves entre modos de controle
- Botão de captura com efeito neon
- Animações de fade e translação para melhor UX

## 🚀 Começando

### Pré-requisitos

- Node.js (v14 ou superior)
- npm ou yarn
- Expo CLI
- Dispositivo físico ou emulador iOS/Android

### Instalação

1. Clone o repositório:
```bash
git clone <https://github.com/Gwin14/Komorebi>
cd camera
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
- **Microfone**: Para gravação de áudio (se implementado)
- **Galeria/Media Library**: Para salvar fotos capturadas

As permissões são solicitadas automaticamente na primeira execução.

## 🛠️ Tecnologias Utilizadas

- **React Native** (0.81.4) - Framework principal
- **Expo** (~54.0.10) - Plataforma de desenvolvimento
- **expo-camera** (^17.0.8) - API de câmera
- **expo-haptics** (~15.0.7) - Feedback tátil
- **expo-media-library** (^18.2.0) - Gerenciamento de mídia
- **@expo/vector-icons** - Ícones da interface
- **Animated API** - Animações nativas

## 📂 Estrutura do Projeto

```
camera/
├── app/
│   ├── components/
│   │   ├── ExposureDialFinal.jsx    # Componente de controle de zoom
│   │   └── shutter.jsx               # Botão de captura
│   ├── _layout.tsx                   # Layout principal
│   └── index.jsx                     # Tela principal da câmera
├── assets/                           # Imagens e recursos
├── app.json                          # Configurações do Expo
└── package.json                      # Dependências do projeto
```

## 🎯 Componentes Principais

### ExposureDialFinal
Dial interativo para controle de zoom com:
- 41 linhas de marcação
- Escala dinâmica baseada na distância do centro
- Feedback háptico diferenciado para marcações principais e secundárias
- Suporte a gestos Pan Responder

### Shutter
Botão de captura estilizado com:
- Design minimalista com efeito neon laranja
- Feedback háptico ao tocar
- Animação de sombra para destaque visual

## 🎨 Personalização

### Cores do Tema
As principais cores podem ser ajustadas nos arquivos de estilo:
- Botão shutter: `#ffaa00ff` (laranja neon)
- Ponteiro do dial: `#ff006e` (rosa)
- Background: `#000` (preto)

### Configurações da Câmera
No arquivo `app.json`, você pode personalizar:
- Mensagens de permissão
- Ícones e splash screen
- Configurações de build para iOS/Android

## 📝 Scripts Disponíveis

```bash
npm start          # Inicia o servidor de desenvolvimento
npm run android    # Executa no Android
npm run ios        # Executa no iOS
npm run web        # Executa na web
npm run lint       # Executa o linter
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
1. Fazer fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abrir um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

**Nota**: Este aplicativo requer um dispositivo físico para melhor experiência, pois emuladores podem ter limitações com recursos de câmera e feedback háptico.
