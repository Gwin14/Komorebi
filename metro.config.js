const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// adiciona .cube às extensões de assets
config.resolver.assetExts.push("CUBE");

module.exports = config;
