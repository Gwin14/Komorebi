const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// adiciona .cube e .CUBE às extensões de assets
config.resolver.assetExts.push("CUBE");
config.resolver.assetExts.push("cube");

module.exports = config;
