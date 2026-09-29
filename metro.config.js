const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
});

// adiciona .cube e .CUBE às extensões de assets
config.resolver.assetExts.push("CUBE");
config.resolver.assetExts.push("cube");
config.resolver.assetExts.push("md");

module.exports = config;
