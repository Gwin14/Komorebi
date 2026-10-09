# UIScene via config plugin

A migração está implementada em `plugins/withUiSceneManifest.js`, registrado em
`app.json`. O plano anterior foi concluído; não é necessário criar um plugin
separado nem substituir manualmente o AppDelegate.

Durante o prebuild, o plugin:

- define `UIApplicationSceneManifest` com uma única cena;
- gera `SceneDelegate.swift`, que cria a janela e inicia o React Native;
- remove a criação legada da janela do AppDelegate e adiciona a configuração da cena;
- registra o SceneDelegate nas Sources do target Xcode;
- encaminha URLs e atividades de continuação para `RCTLinkingManager`.

## Regeneração e verificação

Para atualizar uma cópia nativa existente:

```sh
npx expo prebuild --platform ios --no-install
npx pod-install ios
```

Prepare o runtime MiniCPM antes dos Pods conforme o [README](../README.md).
`prebuild --clean` recria o projeto nativo; preserve ajustes manuais necessários
antes de usá-lo. O plugin é reaplicado também nessa regeneração.

Confira o manifesto em `ios/Komorebi/Info.plist`, o arquivo
`ios/Komorebi/SceneDelegate.swift`, sua presença nas Sources do target e a
configuração de cena no AppDelegate. A inicialização da janela deve acontecer
no SceneDelegate. Recompile e valide abertura, retorno do segundo plano e links
em dispositivo físico. Se o template do Expo mudar, revise os pontos de inserção
do plugin antes de aplicar alterações manuais ao projeto gerado.
