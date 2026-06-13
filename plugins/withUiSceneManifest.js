const { withInfoPlist } = require('expo/config-plugins');

/**
 * Adds UIApplicationSceneManifest to Info.plist to satisfy the iOS 18 SDK
 * requirement for UIScene lifecycle adoption (Apple TN3187).
 * Without this key, apps built with the iOS 18 SDK crash at launch.
 */
module.exports = function withUiSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults['UIApplicationSceneManifest'] = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {},
    };
    return cfg;
  });
};
