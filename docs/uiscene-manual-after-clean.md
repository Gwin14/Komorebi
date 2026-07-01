# Recuperar UIScene depois de `prebuild --clean` (método manual)

Após rodar `expo prebuild --clean`, copiar/editar os arquivos abaixo antes de buildar no Xcode.

---

## 1. Info.plist — automático

`ios/Komorebi/Info.plist` já é corrigido pelo plugin `withUiSceneManifest`.
Nenhuma ação necessária.

---

## 2. Criar ios/Komorebi/SceneDelegate.swift

Criar o arquivo com exatamente este conteúdo:

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

---

## 3. Substituir ios/Komorebi/AppDelegate.swift

Substituir o conteúdo inteiro por:

```swift
import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // UIScene lifecycle — required for iOS 18 SDK (TN3187)
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

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
```

---

## 4. Registrar SceneDelegate.swift no project.pbxproj

Arquivo: `ios/Komorebi.xcodeproj/project.pbxproj`

Fazer as 4 inserções abaixo (buscar a linha âncora e inserir a linha nova logo abaixo):

### 4a. Seção PBXBuildFile

Buscar:

```
F11748422D0307B40044C1D9 /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = F11748412D0307B40044C1D9 /* AppDelegate.swift */; };
```

Inserir depois:

```
		F11748462D0307B40044C1D9 /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = F11748452D0307B40044C1D9 /* SceneDelegate.swift */; };
```

### 4b. Seção PBXFileReference

Buscar:

```
F11748412D0307B40044C1D9 /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = AppDelegate.swift; path = Komorebi/AppDelegate.swift; sourceTree = "<group>"; };
```

Inserir depois:

```
		F11748452D0307B40044C1D9 /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = SceneDelegate.swift; path = Komorebi/SceneDelegate.swift; sourceTree = "<group>"; };
```

### 4c. Seção PBXGroup (grupo Komorebi)

Buscar:

```
F11748412D0307B40044C1D9 /* AppDelegate.swift */,
```

Inserir depois:

```
				F11748452D0307B40044C1D9 /* SceneDelegate.swift */,
```

### 4d. Seção PBXSourcesBuildPhase

Buscar:

```
F11748422D0307B40044C1D9 /* AppDelegate.swift in Sources */,
```

Inserir depois:

```
				F11748462D0307B40044C1D9 /* SceneDelegate.swift in Sources */,
```

---

## Checklist

- [ ] `SceneDelegate.swift` criado em `ios/Komorebi/`
- [ ] `AppDelegate.swift` substituído
- [ ] 4 inserções feitas no `project.pbxproj`
- [ ] Build no Xcode passa sem erro UIScene
