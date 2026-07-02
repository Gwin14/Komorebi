# Plano: Migração UIScene via Config Plugin (permanente)

## Contexto

O Xcode 16 + iOS 18 SDK exige que o app implemente o UIScene lifecycle (TN3187).
A solução atual (AppDelegate.swift + SceneDelegate.swift editados manualmente) não sobrevive
a um `expo prebuild --clean`. Este plano descreve como automatizar tudo via config plugins.

---

## O que precisa ser feito

### 1. Plugin: escrever SceneDelegate.swift

Criar `plugins/withSceneDelegate.js` usando `withDangerousMod` para escrever o arquivo
`ios/Komorebi/SceneDelegate.swift` durante o prebuild.

Conteúdo do arquivo a ser gerado:

```swift
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
    self.window = window
    appDelegate.window = window
  }
}
```

### 2. Plugin: modificar AppDelegate.swift

Usar `withDangerousMod` para ler o `AppDelegate.swift` gerado pelo prebuild e:

a) Remover o bloco `#if os(iOS) || os(tvOS)` que cria a window em `didFinishLaunchingWithOptions`:

```swift
// REMOVER este bloco:
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
```

b) Adicionar os dois métodos UIScene logo após o fechamento de `didFinishLaunchingWithOptions`,
antes das funções de Linking:

```swift
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    config.delegateClass = SceneDelegate.self
    return config
  }

  public func application(
    _ application: UIApplication,
    didDiscardSceneSessions sceneSessions: Set<UISceneSession>
  ) {}
```

### 3. Plugin: registrar SceneDelegate.swift no projeto Xcode

Usar `withXcodeProject` para adicionar `SceneDelegate.swift` ao target de compilação.
Equivale ao que foi feito manualmente no `project.pbxproj`:

- Adicionar entrada em `PBXFileReference`
- Adicionar entrada em `PBXBuildFile`
- Adicionar ao grupo `Komorebi` em `PBXGroup`
- Adicionar ao `PBXSourcesBuildPhase`

A API `withXcodeProject` do `expo/config-plugins` expõe o objeto `project` do
`xcode` npm package, que tem métodos como `addSourceFile` para isso.

### 4. O plugin withUiSceneManifest já está pronto

O plugin `plugins/withUiSceneManifest.js` já adiciona `UIApplicationSceneManifest`
ao `Info.plist`. Não precisa de alteração.

---

## Ordem de execução no app.json

```json
"plugins": [
  ...
  "./plugins/withUiSceneManifest",
  "./plugins/withSceneDelegate",
  "./plugins/withAppDelegateUiScene"
]
```

Os plugins de arquivo (`withSceneDelegate`, `withAppDelegateUiScene`) devem rodar
**depois** do `withUiSceneManifest` e de qualquer plugin que também mexa no AppDelegate.

---

## Notas para a IA que implementar

- O AppDelegate.swift gerado pelo Expo 54 tem o `window` declarado como `var window: UIWindow?`
  no topo da classe — manter essa propriedade, ela é referenciada pelo SceneDelegate.
- Não usar `override` nos dois métodos UIScene novos: `ExpoAppDelegate` não os declara,
  então `override` causaria erro de compilação.
- O `factory.startReactNative` aceita `launchOptions: nil` no SceneDelegate. As launch options
  de notificação/deep link chegam via `connectionOptions` mas o RCT as processa por outros canais.
- Testar com `expo prebuild --clean && npx expo run:ios` e depois com o botão Run do Xcode.
