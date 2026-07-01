const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Força o IPHONEOS_DEPLOYMENT_TARGET de TODOS os pods para um valor mínimo,
 * eliminando os warnings "The iOS deployment target is set to X, but the
 * range of supported deployment target versions is 15.0 to 27.0".
 *
 * O expo-build-properties só ajusta o target principal do app; este plugin
 * injeta um loop no post_install do Podfile que cobre cada pod individual.
 * Como o Podfile é regenerado pelo prebuild, isto roda sempre — fix permanente.
 */
const MIN_TARGET = "15.1";

const SNIPPET = `
  # >>> withIosDeploymentTarget (auto) — força deployment target mínimo em todos os pods
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if current.nil? || current.to_f < ${MIN_TARGET}
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
      end
    end
  end
  # <<< withIosDeploymentTarget (auto)
`;

module.exports = function withIosDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes("withIosDeploymentTarget (auto)")) {
        return cfg;
      }

      // Insere o snippet logo após a chamada react_native_post_install(...).
      contents = contents.replace(
        /(react_native_post_install\([\s\S]*?\)\n)/,
        `$1${SNIPPET}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
