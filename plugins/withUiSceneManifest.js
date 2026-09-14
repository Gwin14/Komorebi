const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SCENE_DELEGATE = `import React
import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: nil
    )
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
`;

const LEGACY_WINDOW_SETUP = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n\n/;

const SCENE_CONFIGURATION_METHOD = `  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

`;

function findAppGroup(project, projectName) {
  const groups = project.hash.project.objects.PBXGroup;
  for (const [key, group] of Object.entries(groups)) {
    if (key.endsWith("_comment") || !Array.isArray(group.children)) continue;
    if (
      groups[`${key}_comment`] === projectName &&
      group.children.some((child) => child.comment === "AppDelegate.swift")
    ) {
      return key;
    }
  }
  throw new Error(`Could not find the ${projectName} source group`);
}

module.exports = function withUiSceneManifest(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

  config = withDangerousMod(config, ["ios", async (cfg) => {
    const projectName = cfg.modRequest.projectName;
    const sourceDir = path.join(cfg.modRequest.platformProjectRoot, projectName);
    const appDelegatePath = path.join(sourceDir, "AppDelegate.swift");
    const sceneDelegatePath = path.join(sourceDir, "SceneDelegate.swift");
    let appDelegate = fs.readFileSync(appDelegatePath, "utf8");

    appDelegate = appDelegate.replace(LEGACY_WINDOW_SETUP, "");
    appDelegate = appDelegate.replace(
      "  public override func application(\n    _ application: UIApplication,\n    configurationForConnecting connectingSceneSession: UISceneSession,",
      "  public func application(\n    _ application: UIApplication,\n    configurationForConnecting connectingSceneSession: UISceneSession,",
    );
    if (!appDelegate.includes("configurationForConnecting connectingSceneSession")) {
      appDelegate = appDelegate.replace(
        "  // Linking API\n",
        `${SCENE_CONFIGURATION_METHOD}  // Linking API\n`,
      );
    }

    fs.writeFileSync(appDelegatePath, appDelegate);
    fs.writeFileSync(sceneDelegatePath, SCENE_DELEGATE);
    return cfg;
  }]);

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const fileRefs = project.hash.project.objects.PBXFileReference;
    const alreadyAdded = Object.values(fileRefs).some(
      (file) => file && file.path === `${projectName}/SceneDelegate.swift`,
    );

    if (!alreadyAdded) {
      project.addSourceFile(
        `${projectName}/SceneDelegate.swift`,
        { target: project.getFirstTarget().uuid },
        findAppGroup(project, projectName),
      );
    }
    return cfg;
  });
};
