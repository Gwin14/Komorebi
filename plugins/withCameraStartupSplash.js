const { withMod, withInfoPlist, withAndroidStyles, withDangerousMod, XML } = require("expo/config-plugins");
const { PNG } = require("pngjs");
const fs = require("fs");
const path = require("path");

const shapes = new Map();

// Native launch screens cannot read the stored camera preferences. Mirror the
// default camera layout until React can apply the user's settings in-place.
function cameraSplashStoryboard() {
  const constraints = [];
  const views = [];
  const constraint = (id, attributes) =>
    constraints.push(`<constraint id="${id}" ${attributes}/>`);
  function shape(id, width, height, radius, color = "0.12549") {
    shapes.set(id, { width, height, radius, color });
    views.push(`<imageView id="${id}" image="Startup-${id}" userInteractionEnabled="NO" contentMode="scaleToFill" translatesAutoresizingMaskIntoConstraints="false">
      <rect key="frame" x="0" y="0" width="${width}" height="${height}"/>
      <constraints><constraint firstAttribute="width" constant="${width}" id="${id}-width"/><constraint firstAttribute="height" constant="${height}" id="${id}-height"/></constraints>
    </imageView>`);
  }
  function centerX(id, fraction, offset = 0) {
    constraint(`${id}-x`, `firstItem="${id}" firstAttribute="centerX" secondItem="camera-root" secondAttribute="centerX" multiplier="${fraction * 2}" constant="${offset}"`);
  }
  for (let index = 0; index < 6; index++) {
    const id = `camera-control-${index}`;
    const fraction = (index + 0.5) / 6;
    shape(id, 38, 38, 11);
    centerX(id, fraction, 4 - 8 * fraction);
    constraint(`${id}-y`, `firstItem="${id}" firstAttribute="top" secondItem="camera-safe" secondAttribute="top" constant="3"`);
  }
  views.push('<view id="camera-preview" userInteractionEnabled="NO" translatesAutoresizingMaskIntoConstraints="false"><rect key="frame" x="0" y="44" width="393" height="524"/><color key="backgroundColor" white="0.062745" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/></view>');
  constraint("preview-top", 'firstItem="camera-preview" firstAttribute="top" secondItem="camera-safe" secondAttribute="top" constant="44"');
  constraint("preview-left", 'firstItem="camera-preview" firstAttribute="leading" secondItem="camera-root" secondAttribute="leading"');
  constraint("preview-width", 'firstItem="camera-preview" firstAttribute="width" secondItem="camera-root" secondAttribute="width"');
  constraint("preview-height", 'firstItem="camera-preview" firstAttribute="height" secondItem="camera-root" secondAttribute="width" multiplier="4:3"');
  shape("camera-adjustment", 176, 6, 3);
  centerX("camera-adjustment", 0.5);
  constraint("adjustment-y", 'firstItem="camera-adjustment" firstAttribute="top" secondItem="camera-preview" secondAttribute="bottom" constant="41"');
  shape("camera-shutter", 80, 80, 30, "0.188235");
  shape("camera-shutter-inner", 72, 72, 26, "0.066667");
  shape("camera-gallery", 52, 52, 8);
  shape("camera-flip", 54, 54, 8);
  centerX("camera-shutter", 0.5);
  centerX("camera-shutter-inner", 0.5);
  centerX("camera-gallery", 0.25, -20);
  centerX("camera-flip", 0.75, 20);
  for (const id of ["camera-shutter", "camera-shutter-inner", "camera-gallery", "camera-flip"]) {
    constraint(`${id}-y`, `firstItem="${id}" firstAttribute="centerY" secondItem="camera-preview" secondAttribute="bottom" constant="108"`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="24093.7" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="camera-controller">
<device id="retina6_12" orientation="portrait" appearance="dark"/>
<dependencies><deployment identifier="iOS"/><plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/><capability name="Safe area layout guides" minToolsVersion="9.0"/><capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/></dependencies>
<scenes><scene sceneID="camera-scene"><objects><viewController storyboardIdentifier="SplashScreenViewController" id="camera-controller" sceneMemberID="viewController"><view key="view" id="camera-root" userInteractionEnabled="NO" contentMode="scaleToFill"><rect key="frame" x="0" y="0" width="393" height="852"/><autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/><subviews>${views.join("\n")}</subviews><viewLayoutGuide key="safeArea" id="camera-safe"/><color key="backgroundColor" white="0" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/><constraints>${constraints.join("\n")}</constraints></view></viewController><placeholder placeholderIdentifier="IBFirstResponder" id="camera-responder" sceneMemberID="firstResponder"/></objects></scene></scenes><resources>${[...shapes].map(([id, shape]) => `<image name="Startup-${id}" width="${shape.width}" height="${shape.height}"/>`).join("\n")}</resources></document>`;
}

// Launch storyboards do not allow layer.cornerRadius runtime attributes.
// Small bundled rounded shapes preserve the exact skeleton without custom code
// running during the native launch screen.
function writeStartupAssets(sourceDir) {
  cameraSplashStoryboard();
  for (const [id, { width, height, radius, color }] of shapes) {
    const scale = 3;
    const image = new PNG({ width: width * scale, height: height * scale });
    const shade = Math.round(Number(color) * 255);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const px = (x + 0.5) / scale;
        const py = (y + 0.5) / scale;
        const dx = Math.max(radius - px, 0, px - (width - radius));
        const dy = Math.max(radius - py, 0, py - (height - radius));
        const offset = (y * image.width + x) * 4;
        image.data[offset] = shade;
        image.data[offset + 1] = shade;
        image.data[offset + 2] = shade;
        image.data[offset + 3] = dx * dx + dy * dy <= radius * radius ? 255 : 0;
      }
    }
    const assetDir = path.join(sourceDir, "Images.xcassets", `Startup-${id}.imageset`);
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, "shape@3x.png"), PNG.sync.write(image));
    fs.writeFileSync(path.join(assetDir, "Contents.json"), JSON.stringify({
      images: [{ filename: "shape@3x.png", idiom: "universal", scale: "3x" }],
      info: { version: 1, author: "xcode" },
    }, null, 2));
  }
}

module.exports = function withCameraStartupSplash(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIStatusBarHidden = true;
    return cfg;
  });
  config = withDangerousMod(config, ["ios", async (cfg) => {
    writeStartupAssets(path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName));
    return cfg;
  }]);
  config = withMod(config, {
    platform: "ios",
    mod: "splashScreenStoryboard",
    action: async (cfg) => {
      cfg.modResults = await XML.parseXMLAsync(cameraSplashStoryboard());
      return cfg;
    },
  });
  // Android 12+ owns the launch splash layout. Use the same black background
  // and hand off to the camera skeleton as soon as React lays out its shell.
  return withAndroidStyles(config, (cfg) => {
    const splash = cfg.modResults.resources.style.find(
      (style) => style.$.name === "Theme.App.SplashScreen",
    );
    if (splash) {
      const icon = splash.item.find(
        (item) => item.$.name === "windowSplashScreenAnimatedIcon",
      );
      if (icon) icon._ = "@android:color/transparent";
    }
    return cfg;
  });
};

module.exports.cameraSplashStoryboard = cameraSplashStoryboard;
module.exports.serializeStoryboard = async () =>
  XML.format(await XML.parseXMLAsync(cameraSplashStoryboard()));

module.exports.writeStartupAssets = writeStartupAssets;
