const { withDangerousMod, withInfoPlist } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");
const xcode = require("xcode");

const TARGET_NAME = "LockedCameraCaptureExtension";
const WIDGET_TARGET_NAME = "LockedCameraCaptureWidget";
const MAIN_BUNDLE_ID = "br.dev.fabiosantos.komorebi.app";
const EXTENSION_BUNDLE_ID = `${MAIN_BUNDLE_ID}.${TARGET_NAME}`;
const WIDGET_BUNDLE_ID = `${MAIN_BUNDLE_ID}.${WIDGET_TARGET_NAME}`;
const DEVELOPMENT_TEAM = "67RRF637HK";

const EXTENSION_MAIN_SWIFT = `import ExtensionKit
import Foundation
import LockedCameraCapture
import SwiftUI

@main
struct KomorebiLockedCameraCaptureExtension: LockedCameraCaptureExtension {
  var body: some LockedCameraCaptureExtensionScene {
    LockedCameraCaptureUIScene { session in
      LockedCameraView(session: session)
    }
  }
}
`;

const CAMERA_INTENT_SWIFT = `import AppIntents
import Foundation

@available(iOS 18.0, *)
struct KomorebiCameraCaptureIntent: CameraCaptureIntent {
  static var title: LocalizedStringResource = "Komorebi"
  static var description = IntentDescription("Open the Komorebi camera.")
  static var isDiscoverable: Bool = true
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var openAppWhenRun: Bool = true

  @available(iOS 26.0, *)
  static var supportedModes: IntentModes = [.foreground(.immediate), .background]

  @MainActor
  func perform() async throws -> some IntentResult {
    .result()
  }
}

@available(iOS 18.0, *)
struct KomorebiCameraShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: KomorebiCameraCaptureIntent(),
      phrases: [
        "Open \\(.applicationName)",
        "Open camera in \\(.applicationName)",
      ],
      shortTitle: "Komorebi",
      systemImageName: "camera"
    )
  }
}
`;

const WIDGET_SWIFT = `import AppIntents
import SwiftUI
import WidgetKit

@main
struct KomorebiLockedCameraControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "br.dev.fabiosantos.komorebi.camera-control") {
      ControlWidgetButton(action: KomorebiCameraCaptureIntent()) {
        Label("Komorebi", systemImage: "camera")
      }
    }
    .displayName("Komorebi")
    .description("Open the Komorebi camera.")
  }
}
`;

const EXTENSION_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Komorebi</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>EXAppExtensionAttributes</key>
  <dict>
    <key>EXExtensionPointIdentifier</key>
    <string>com.apple.securecapture</string>
  </dict>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.securecapture</string>
  </dict>
  <key>NSCameraUsageDescription</key>
  <string>Precisamos da câmera para tirar fotos.</string>
</dict>
</plist>
`;

const WIDGET_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Komorebi</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;

const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
`;

const LOCKED_CAMERA_VIEW_SWIFT = `import AVFoundation
import AVKit
import LockedCameraCapture
import SwiftUI
import UIKit

struct LockedCameraView: View {
  @StateObject private var camera = LockedCameraController()
  let session: LockedCameraCaptureSession

  var body: some View {
    ZStack {
      CameraPreviewView(session: camera.captureSession)
        .ignoresSafeArea()

      CaptureButtonInteractionView(
        isEnabled: camera.isReady,
        onPress: {
          camera.capturePhoto(to: session.sessionContentURL)
        }
      )
      .frame(width: 1, height: 1)

      if let message = camera.message {
        Text(message)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .padding(.vertical, 10)
          .background(.black.opacity(0.58), in: Capsule())
          .padding(.top, 54)
          .frame(maxHeight: .infinity, alignment: .top)
      }

      VStack {
        Spacer()
        HStack(spacing: 34) {
          Button {
            Task { await openApplication() }
          } label: {
            Image(systemName: "lock.open")
              .font(.system(size: 22, weight: .semibold))
              .frame(width: 58, height: 58)
              .foregroundStyle(.white)
              .background(.black.opacity(0.5), in: Circle())
          }
          .accessibilityLabel("Abrir Komorebi")

          Button {
            camera.capturePhoto(to: session.sessionContentURL)
          } label: {
            ZStack {
              Circle()
                .stroke(.white, lineWidth: 4)
                .frame(width: 76, height: 76)
              Circle()
                .fill(.white)
                .frame(width: 62, height: 62)
            }
          }
          .disabled(!camera.isReady)
          .opacity(camera.isReady ? 1 : 0.55)
          .accessibilityLabel("Tirar foto")

          Button {
            camera.switchCamera()
          } label: {
            Image(systemName: "arrow.triangle.2.circlepath.camera")
              .font(.system(size: 22, weight: .semibold))
              .frame(width: 58, height: 58)
              .foregroundStyle(.white)
              .background(.black.opacity(0.5), in: Circle())
          }
          .accessibilityLabel("Alternar câmera")
        }
        .padding(.bottom, 42)
      }
    }
    .task {
      await camera.requestAccessAndStart()
    }
    .onDisappear {
      camera.stop()
    }
  }

  private func openApplication() async {
    let activity = NSUserActivity(activityType: NSUserActivityTypeLockedCameraCapture)
    activity.title = "Open Komorebi"
    try? await session.openApplication(for: activity)
  }
}

private struct CaptureButtonInteractionView: UIViewRepresentable {
  let isEnabled: Bool
  let onPress: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onPress: onPress)
  }

  func makeUIView(context: Context) -> UIView {
    let view = UIView(frame: .zero)
    view.backgroundColor = .clear
    context.coordinator.update(onPress: onPress)
    context.coordinator.attachIfNeeded(to: view, isEnabled: isEnabled)
    return view
  }

  func updateUIView(_ uiView: UIView, context: Context) {
    context.coordinator.update(onPress: onPress)
    context.coordinator.attachIfNeeded(to: uiView, isEnabled: isEnabled)
  }

  final class Coordinator {
    private var interaction: AnyObject?
    private var onPress: () -> Void

    init(onPress: @escaping () -> Void) {
      self.onPress = onPress
    }

    func update(onPress: @escaping () -> Void) {
      self.onPress = onPress
    }

    func attachIfNeeded(to view: UIView, isEnabled: Bool) {
      guard #available(iOS 17.2, *) else { return }

      if !isEnabled {
        detach()
        return
      }

      if interaction != nil { return }

      let interaction = AVCaptureEventInteraction(
        primary: { [weak self] event in
          if event.phase == .ended {
            self?.onPress()
          }
        },
        secondary: { [weak self] event in
          if event.phase == .ended {
            self?.onPress()
          }
        }
      )
      view.addInteraction(interaction)
      self.interaction = interaction
    }

    func detach() {
      guard #available(iOS 17.2, *) else {
        interaction = nil
        return
      }
      if let interaction = interaction as? AVCaptureEventInteraction {
        interaction.view?.removeInteraction(interaction)
      }
      interaction = nil
    }

    deinit {
      detach()
    }
  }
}

private struct CameraPreviewView: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> PreviewView {
    let view = PreviewView()
    view.videoPreviewLayer.session = session
    view.videoPreviewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: PreviewView, context: Context) {
    uiView.videoPreviewLayer.session = session
  }
}

private final class PreviewView: UIView {
  override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  var videoPreviewLayer: AVCaptureVideoPreviewLayer {
    layer as! AVCaptureVideoPreviewLayer
  }
}

@MainActor
private final class LockedCameraController: NSObject, ObservableObject {
  @Published var isReady = false
  @Published var message: String?

  let captureSession = AVCaptureSession()

  private let sessionQueue = DispatchQueue(label: "br.dev.fabiosantos.komorebi.locked-camera.session")
  private let photoOutput = AVCapturePhotoOutput()
  private var currentPosition: AVCaptureDevice.Position = .back
  private var configured = false
  private var inFlightDelegates: [PhotoCaptureDelegate] = []

  func requestAccessAndStart() async {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      start()
    case .notDetermined:
      let granted = await AVCaptureDevice.requestAccess(for: .video)
      if granted {
        start()
      } else {
        message = "Acesso a camera negado"
      }
    default:
      message = "Acesso a camera negado"
    }
  }

  func start() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if !self.configured {
        self.configureSession(position: self.currentPosition)
      }
      if !self.captureSession.isRunning {
        self.captureSession.startRunning()
      }
      DispatchQueue.main.async {
        self.isReady = self.configured
      }
    }
  }

  func stop() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.captureSession.isRunning {
        self.captureSession.stopRunning()
      }
    }
  }

  func switchCamera() {
    currentPosition = currentPosition == .back ? .front : .back
    isReady = false
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.configureSession(position: self.currentPosition)
      if !self.captureSession.isRunning {
        self.captureSession.startRunning()
      }
      DispatchQueue.main.async {
        self.isReady = self.configured
      }
    }
  }

  func capturePhoto(to directory: URL) {
    guard isReady else { return }
    sessionQueue.async { [weak self] in
      guard let self else { return }
      let settings = AVCapturePhotoSettings()
      settings.flashMode = .off
      let delegate = PhotoCaptureDelegate(outputDirectory: directory) { [weak self] delegate, result in
        DispatchQueue.main.async {
          self?.inFlightDelegates.removeAll { $0 === delegate }
          switch result {
          case .success:
            self?.message = "Foto capturada"
            Task { @MainActor in
              try? await Task.sleep(nanoseconds: 1_200_000_000)
              if self?.message == "Foto capturada" {
                self?.message = nil
              }
            }
          case .failure:
            self?.message = "Nao foi possivel capturar"
          }
        }
      }
      DispatchQueue.main.async {
        self.inFlightDelegates.append(delegate)
      }
      self.photoOutput.capturePhoto(with: settings, delegate: delegate)
    }
  }

  private func configureSession(position: AVCaptureDevice.Position) {
    captureSession.beginConfiguration()
    defer {
      captureSession.commitConfiguration()
    }

    captureSession.sessionPreset = .photo
    captureSession.inputs.forEach { captureSession.removeInput($0) }

    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
      let input = try? AVCaptureDeviceInput(device: device),
      captureSession.canAddInput(input)
    else {
      configured = false
      DispatchQueue.main.async {
        self.message = "Camera indisponivel"
      }
      return
    }

    captureSession.addInput(input)

    if !captureSession.outputs.contains(photoOutput), captureSession.canAddOutput(photoOutput) {
      captureSession.addOutput(photoOutput)
    }

    if let connection = photoOutput.connection(with: .video), connection.isVideoOrientationSupported {
      connection.videoOrientation = .portrait
    }

    configured = true
  }
}

private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let outputDirectory: URL
  private let completion: (PhotoCaptureDelegate, Result<URL, Error>) -> Void

  init(
    outputDirectory: URL,
    completion: @escaping (PhotoCaptureDelegate, Result<URL, Error>) -> Void
  ) {
    self.outputDirectory = outputDirectory
    self.completion = completion
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error {
      completion(self, .failure(error))
      return
    }

    guard let data = photo.fileDataRepresentation() else {
      completion(self, .failure(PhotoCaptureError.missingData))
      return
    }

    do {
      try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
      )
      let url = outputDirectory.appendingPathComponent("komorebi-\\\\(UUID().uuidString).jpg")
      try data.write(to: url, options: .atomic)
      completion(self, .success(url))
    } catch {
      completion(self, .failure(error))
    }
  }
}

private enum PhotoCaptureError: Error {
  case missingData
}
`;

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === contents) {
    return;
  }
  fs.writeFileSync(filePath, contents);
}

function updateXcodeProject(projectPath) {
  const project = xcode.project(projectPath);
  project.parseSync();

  const mainTarget = project.getFirstTarget().uuid;
  const objects = project.hash.project.objects;
  const section = (name) => {
    if (!objects[name]) objects[name] = {};
    return objects[name];
  };
  const uuidByComment = (secName, comment, predicate = null) => {
    const sec = section(secName);
    for (const key of Object.keys(sec)) {
      if (!key.endsWith("_comment") || sec[key] !== comment) continue;
      const uuid = key.replace(/_comment$/, "");
      if (!predicate || predicate(sec[uuid], uuid)) return uuid;
    }
    return null;
  };
  const addChildToGroup = (groupUuid, fileRef, comment) => {
    const group = section("PBXGroup")[groupUuid];
    if (!group.children.some((child) => child.value === fileRef)) {
      group.children.push({ value: fileRef, comment });
    }
  };
  const addFileRef = ({ pathValue, name, lastKnownFileType, explicitFileType, sourceTree = '"<group>"', includeInIndex }) => {
    const existing = Object.entries(section("PBXFileReference")).find(
      ([key, value]) =>
        !key.endsWith("_comment") &&
        value.path === pathValue &&
        (!name || section("PBXFileReference")[`${key}_comment`] === name),
    );
    if (existing) return existing[0];
    const uuid = project.generateUuid();
    const obj = { isa: "PBXFileReference", path: pathValue, sourceTree };
    if (name) obj.name = name;
    if (lastKnownFileType) obj.lastKnownFileType = lastKnownFileType;
    if (explicitFileType) obj.explicitFileType = explicitFileType;
    if (includeInIndex !== undefined) obj.includeInIndex = includeInIndex;
    section("PBXFileReference")[uuid] = obj;
    section("PBXFileReference")[`${uuid}_comment`] = name || path.basename(pathValue);
    return uuid;
  };
  const addBuildFile = (fileRef, comment, settings) => {
    const existing = Object.entries(section("PBXBuildFile")).find(
      ([key, value]) =>
        !key.endsWith("_comment") &&
        value.fileRef === fileRef &&
        section("PBXBuildFile")[`${key}_comment`] === comment,
    );
    if (existing) return existing[0];
    const uuid = project.generateUuid();
    const obj = { isa: "PBXBuildFile", fileRef };
    if (settings) obj.settings = settings;
    section("PBXBuildFile")[uuid] = obj;
    section("PBXBuildFile")[`${uuid}_comment`] = comment;
    return uuid;
  };
  const getBuildPhase = (targetUuid, isa, comment) => {
    const target = section("PBXNativeTarget")[targetUuid];
    for (const phase of target.buildPhases || []) {
      if (phase.comment === comment && section(isa)[phase.value]) return phase.value;
    }
    return null;
  };
  const ensureBuildPhase = (targetUuid, isa, comment, extra = {}) => {
    const existing = getBuildPhase(targetUuid, isa, comment);
    if (existing) return existing;
    const uuid = project.generateUuid();
    section(isa)[uuid] = {
      isa,
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
      ...extra,
    };
    section(isa)[`${uuid}_comment`] = comment;
    section("PBXNativeTarget")[targetUuid].buildPhases.push({ value: uuid, comment });
    return uuid;
  };
  const addBuildFileToPhase = (phaseUuid, phaseSection, buildFileUuid, comment) => {
    const phase = section(phaseSection)[phaseUuid];
    if (!phase.files.some((item) => item.value === buildFileUuid)) {
      phase.files.push({ value: buildFileUuid, comment });
    }
  };
  const removeDuplicateEmbeddedProducts = (targetUuid, keepPhaseUuid, productRefs) => {
    const target = section("PBXNativeTarget")[targetUuid];
    const productRefSet = new Set(productRefs);

    for (const phaseRef of target.buildPhases || []) {
      const phaseUuid = phaseRef.value;
      if (phaseUuid === keepPhaseUuid) continue;

      const phase = section("PBXCopyFilesBuildPhase")[phaseUuid];
      if (!phase || Number(phase.dstSubfolderSpec) !== 13) continue;

      phase.files = (phase.files || []).filter((file) => {
        const buildFile = section("PBXBuildFile")[file.value];
        return !buildFile || !productRefSet.has(buildFile.fileRef);
      });
    }
  };
  const ensureTargetDependency = (targetUuid, dependencyTargetUuid) => {
    const target = section("PBXNativeTarget")[targetUuid];
    const dependencyTarget = section("PBXNativeTarget")[dependencyTargetUuid];
    if (target.dependencies.some((dependency) => section("PBXTargetDependency")[dependency.value]?.target === dependencyTargetUuid)) {
      return;
    }
    const proxyUuid = project.generateUuid();
    section("PBXContainerItemProxy")[proxyUuid] = {
      isa: "PBXContainerItemProxy",
      containerPortal: project.hash.project.rootObject,
      proxyType: 1,
      remoteGlobalIDString: dependencyTargetUuid,
      remoteInfo: dependencyTarget.name,
    };
    section("PBXContainerItemProxy")[`${proxyUuid}_comment`] = "PBXContainerItemProxy";

    const dependencyUuid = project.generateUuid();
    section("PBXTargetDependency")[dependencyUuid] = {
      isa: "PBXTargetDependency",
      target: dependencyTargetUuid,
      targetProxy: proxyUuid,
    };
    section("PBXTargetDependency")[`${dependencyUuid}_comment`] = "PBXTargetDependency";
    target.dependencies.push({ value: dependencyUuid, comment: "PBXTargetDependency" });
  };
  const getTargetUuid = (name) => {
    for (const [key, value] of Object.entries(section("PBXNativeTarget"))) {
      if (key.endsWith("_comment")) continue;
      if (String(value.name || "").replace(/^"|"$/g, "") === name) return key;
    }
    return null;
  };
  const ensureBuildConfig = (name, buildSettings) => {
    const uuid = project.generateUuid();
    section("XCBuildConfiguration")[uuid] = { isa: "XCBuildConfiguration", buildSettings, name };
    section("XCBuildConfiguration")[`${uuid}_comment`] = name;
    return uuid;
  };
  const ensureConfigList = (debugUuid, releaseUuid) => {
    const uuid = project.generateUuid();
    section("XCConfigurationList")[uuid] = {
      isa: "XCConfigurationList",
      buildConfigurations: [
        { value: debugUuid, comment: "Debug" },
        { value: releaseUuid, comment: "Release" },
      ],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: "Release",
    };
    section("XCConfigurationList")[`${uuid}_comment`] =
      `Build configuration list for PBXNativeTarget "${TARGET_NAME}"`;
    return uuid;
  };

  const mainGroup = project.getFirstProject().firstProject.mainGroup;
  const appGroup = uuidByComment("PBXGroup", "Komorebi", (group) =>
    Array.isArray(group.children) && group.children.some((child) => child.comment === "AppDelegate.swift"),
  );
  const productsGroup = uuidByComment("PBXGroup", "Products");
  const frameworksGroup = uuidByComment("PBXGroup", "Frameworks");

  const intentRef = addFileRef({
    pathValue: "Komorebi/CameraCaptureIntent.swift",
    name: "CameraCaptureIntent.swift",
    lastKnownFileType: "sourcecode.swift",
  });
  addChildToGroup(appGroup, intentRef, "CameraCaptureIntent.swift");
  addBuildFileToPhase(
    getBuildPhase(mainTarget, "PBXSourcesBuildPhase", "Sources"),
    "PBXSourcesBuildPhase",
    addBuildFile(intentRef, "CameraCaptureIntent.swift in Sources"),
    "CameraCaptureIntent.swift in Sources",
  );

  let extensionTarget = getTargetUuid(TARGET_NAME);
  let extensionProductRef = null;
  if (!extensionTarget) {
    const baseSettings = {
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_ENTITLEMENTS: `${TARGET_NAME}/${TARGET_NAME}.entitlements`,
      CURRENT_PROJECT_VERSION: 1,
      DEVELOPMENT_TEAM,
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `${TARGET_NAME}/Info.plist`,
      IPHONEOS_DEPLOYMENT_TARGET: 18.0,
      LD_RUNPATH_SEARCH_PATHS: ['"$(inherited)"', '"@executable_path/Frameworks"', '"@executable_path/../../Frameworks"'],
      MARKETING_VERSION: 1.0,
      PRODUCT_BUNDLE_IDENTIFIER: EXTENSION_BUNDLE_ID,
      PRODUCT_NAME: TARGET_NAME,
      SKIP_INSTALL: "YES",
      SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
      SUPPORTS_MACCATALYST: "NO",
      SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
      SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: "NO",
      SWIFT_VERSION: 5.0,
      TARGETED_DEVICE_FAMILY: 1,
    };
    const debug = ensureBuildConfig("Debug", {
      ...baseSettings,
      GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
      SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
    });
    const release = ensureBuildConfig("Release", baseSettings);
    const configList = ensureConfigList(debug, release);
    const sources = project.generateUuid();
    const frameworks = project.generateUuid();
    const resources = project.generateUuid();
    section("PBXSourcesBuildPhase")[sources] = { isa: "PBXSourcesBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXSourcesBuildPhase")[`${sources}_comment`] = "Sources";
    section("PBXFrameworksBuildPhase")[frameworks] = { isa: "PBXFrameworksBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXFrameworksBuildPhase")[`${frameworks}_comment`] = "Frameworks";
    section("PBXResourcesBuildPhase")[resources] = { isa: "PBXResourcesBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXResourcesBuildPhase")[`${resources}_comment`] = "Resources";

    extensionProductRef = addFileRef({
      pathValue: `${TARGET_NAME}.appex`,
      name: `${TARGET_NAME}.appex`,
      explicitFileType: "wrapper.app-extension",
      sourceTree: "BUILT_PRODUCTS_DIR",
      includeInIndex: 0,
    });
    extensionTarget = project.generateUuid();
    section("PBXNativeTarget")[extensionTarget] = {
      isa: "PBXNativeTarget",
      buildConfigurationList: configList,
      buildPhases: [
        { value: sources, comment: "Sources" },
        { value: frameworks, comment: "Frameworks" },
        { value: resources, comment: "Resources" },
      ],
      buildRules: [],
      dependencies: [],
      name: TARGET_NAME,
      productName: TARGET_NAME,
      productReference: extensionProductRef,
      productType: '"com.apple.product-type.app-extension"',
    };
    section("PBXNativeTarget")[`${extensionTarget}_comment`] = TARGET_NAME;
    const projectObj = project.getFirstProject().firstProject;
    projectObj.targets.push({ value: extensionTarget, comment: TARGET_NAME });
    projectObj.attributes.TargetAttributes[extensionTarget] = { CreatedOnToolsVersion: 16.0 };
    addChildToGroup(productsGroup, extensionProductRef, `${TARGET_NAME}.appex`);
  } else {
    extensionProductRef = section("PBXNativeTarget")[extensionTarget].productReference;
  }

  let extensionGroup = uuidByComment("PBXGroup", TARGET_NAME);
  if (!extensionGroup) {
    extensionGroup = project.generateUuid();
    section("PBXGroup")[extensionGroup] = {
      isa: "PBXGroup",
      children: [],
      name: TARGET_NAME,
      path: TARGET_NAME,
      sourceTree: '"<group>"',
    };
    section("PBXGroup")[`${extensionGroup}_comment`] = TARGET_NAME;
    addChildToGroup(mainGroup, extensionGroup, TARGET_NAME);
  }

  const extensionSourcesPhase = getBuildPhase(extensionTarget, "PBXSourcesBuildPhase", "Sources");
  for (const file of ["LockedCameraCaptureExtension.swift", "LockedCameraView.swift"]) {
    const ref = addFileRef({ pathValue: file, name: file, lastKnownFileType: "sourcecode.swift" });
    addChildToGroup(extensionGroup, ref, file);
    addBuildFileToPhase(
      extensionSourcesPhase,
      "PBXSourcesBuildPhase",
      addBuildFile(ref, `${file} in Sources`),
      `${file} in Sources`,
    );
  }
  addBuildFileToPhase(
    extensionSourcesPhase,
    "PBXSourcesBuildPhase",
    addBuildFile(intentRef, `CameraCaptureIntent.swift in ${TARGET_NAME} Sources`),
    `CameraCaptureIntent.swift in ${TARGET_NAME} Sources`,
  );
  for (const file of ["Info.plist", `${TARGET_NAME}.entitlements`]) {
    const ref = addFileRef({
      pathValue: file,
      name: file,
      lastKnownFileType: file.endsWith(".plist") ? "text.plist.xml" : "text.plist.entitlements",
    });
    addChildToGroup(extensionGroup, ref, file);
  }
  const extensionFrameworksPhase = getBuildPhase(extensionTarget, "PBXFrameworksBuildPhase", "Frameworks");
  for (const framework of ["AVFoundation.framework", "AVKit.framework", "ExtensionKit.framework", "LockedCameraCapture.framework", "SwiftUI.framework"]) {
    const ref = addFileRef({
      pathValue: `System/Library/Frameworks/${framework}`,
      name: framework,
      lastKnownFileType: "wrapper.framework",
      sourceTree: "SDKROOT",
    });
    addChildToGroup(frameworksGroup, ref, framework);
    addBuildFileToPhase(
      extensionFrameworksPhase,
      "PBXFrameworksBuildPhase",
      addBuildFile(ref, `${framework} in Frameworks`),
      `${framework} in Frameworks`,
    );
  }

  let widgetTarget = getTargetUuid(WIDGET_TARGET_NAME);
  let widgetProductRef = null;
  if (!widgetTarget) {
    const baseSettings = {
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_ENTITLEMENTS: `${WIDGET_TARGET_NAME}/${WIDGET_TARGET_NAME}.entitlements`,
      CURRENT_PROJECT_VERSION: 1,
      DEVELOPMENT_TEAM,
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `${WIDGET_TARGET_NAME}/Info.plist`,
      IPHONEOS_DEPLOYMENT_TARGET: 18.0,
      LD_RUNPATH_SEARCH_PATHS: ['"$(inherited)"', '"@executable_path/Frameworks"', '"@executable_path/../../Frameworks"'],
      MARKETING_VERSION: 1.0,
      PRODUCT_BUNDLE_IDENTIFIER: WIDGET_BUNDLE_ID,
      PRODUCT_NAME: WIDGET_TARGET_NAME,
      SKIP_INSTALL: "YES",
      SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
      SUPPORTS_MACCATALYST: "NO",
      SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
      SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: "NO",
      SWIFT_VERSION: 5.0,
      TARGETED_DEVICE_FAMILY: 1,
    };
    const debug = ensureBuildConfig("Debug", {
      ...baseSettings,
      GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
      SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
    });
    const release = ensureBuildConfig("Release", baseSettings);
    const configList = ensureConfigList(debug, release);
    section("XCConfigurationList")[`${configList}_comment`] =
      `Build configuration list for PBXNativeTarget "${WIDGET_TARGET_NAME}"`;
    const sources = project.generateUuid();
    const frameworks = project.generateUuid();
    const resources = project.generateUuid();
    section("PBXSourcesBuildPhase")[sources] = { isa: "PBXSourcesBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXSourcesBuildPhase")[`${sources}_comment`] = "Sources";
    section("PBXFrameworksBuildPhase")[frameworks] = { isa: "PBXFrameworksBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXFrameworksBuildPhase")[`${frameworks}_comment`] = "Frameworks";
    section("PBXResourcesBuildPhase")[resources] = { isa: "PBXResourcesBuildPhase", buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    section("PBXResourcesBuildPhase")[`${resources}_comment`] = "Resources";

    widgetProductRef = addFileRef({
      pathValue: `${WIDGET_TARGET_NAME}.appex`,
      name: `${WIDGET_TARGET_NAME}.appex`,
      explicitFileType: "wrapper.app-extension",
      sourceTree: "BUILT_PRODUCTS_DIR",
      includeInIndex: 0,
    });
    widgetTarget = project.generateUuid();
    section("PBXNativeTarget")[widgetTarget] = {
      isa: "PBXNativeTarget",
      buildConfigurationList: configList,
      buildPhases: [
        { value: sources, comment: "Sources" },
        { value: frameworks, comment: "Frameworks" },
        { value: resources, comment: "Resources" },
      ],
      buildRules: [],
      dependencies: [],
      name: WIDGET_TARGET_NAME,
      productName: WIDGET_TARGET_NAME,
      productReference: widgetProductRef,
      productType: '"com.apple.product-type.app-extension"',
    };
    section("PBXNativeTarget")[`${widgetTarget}_comment`] = WIDGET_TARGET_NAME;
    const projectObj = project.getFirstProject().firstProject;
    projectObj.targets.push({ value: widgetTarget, comment: WIDGET_TARGET_NAME });
    projectObj.attributes.TargetAttributes[widgetTarget] = { CreatedOnToolsVersion: 16.0 };
    addChildToGroup(productsGroup, widgetProductRef, `${WIDGET_TARGET_NAME}.appex`);
  } else {
    widgetProductRef = section("PBXNativeTarget")[widgetTarget].productReference;
  }

  let widgetGroup = uuidByComment("PBXGroup", WIDGET_TARGET_NAME);
  if (!widgetGroup) {
    widgetGroup = project.generateUuid();
    section("PBXGroup")[widgetGroup] = {
      isa: "PBXGroup",
      children: [],
      name: WIDGET_TARGET_NAME,
      path: WIDGET_TARGET_NAME,
      sourceTree: '"<group>"',
    };
    section("PBXGroup")[`${widgetGroup}_comment`] = WIDGET_TARGET_NAME;
    addChildToGroup(mainGroup, widgetGroup, WIDGET_TARGET_NAME);
  }

  const widgetSourcesPhase = getBuildPhase(widgetTarget, "PBXSourcesBuildPhase", "Sources");
  const widgetSwiftRef = addFileRef({
    pathValue: `${WIDGET_TARGET_NAME}.swift`,
    name: `${WIDGET_TARGET_NAME}.swift`,
    lastKnownFileType: "sourcecode.swift",
  });
  addChildToGroup(widgetGroup, widgetSwiftRef, `${WIDGET_TARGET_NAME}.swift`);
  addBuildFileToPhase(
    widgetSourcesPhase,
    "PBXSourcesBuildPhase",
    addBuildFile(widgetSwiftRef, `${WIDGET_TARGET_NAME}.swift in Sources`),
    `${WIDGET_TARGET_NAME}.swift in Sources`,
  );
  addBuildFileToPhase(
    widgetSourcesPhase,
    "PBXSourcesBuildPhase",
    addBuildFile(intentRef, `CameraCaptureIntent.swift in ${WIDGET_TARGET_NAME} Sources`),
    `CameraCaptureIntent.swift in ${WIDGET_TARGET_NAME} Sources`,
  );
  for (const file of ["Info.plist", `${WIDGET_TARGET_NAME}.entitlements`]) {
    const ref = addFileRef({
      pathValue: file,
      name: file,
      lastKnownFileType: file.endsWith(".plist") ? "text.plist.xml" : "text.plist.entitlements",
    });
    addChildToGroup(widgetGroup, ref, file);
  }
  const widgetFrameworksPhase = getBuildPhase(widgetTarget, "PBXFrameworksBuildPhase", "Frameworks");
  for (const framework of ["AppIntents.framework", "SwiftUI.framework", "WidgetKit.framework"]) {
    const ref = addFileRef({
      pathValue: `System/Library/Frameworks/${framework}`,
      name: framework,
      lastKnownFileType: "wrapper.framework",
      sourceTree: "SDKROOT",
    });
    addChildToGroup(frameworksGroup, ref, framework);
    addBuildFileToPhase(
      widgetFrameworksPhase,
      "PBXFrameworksBuildPhase",
      addBuildFile(ref, `${framework} in ${WIDGET_TARGET_NAME} Frameworks`),
      `${framework} in ${WIDGET_TARGET_NAME} Frameworks`,
    );
  }

  const embedPhase = ensureBuildPhase(mainTarget, "PBXCopyFilesBuildPhase", "Embed App Extensions", {
    dstPath: '""',
    dstSubfolderSpec: 13,
  });
  addBuildFileToPhase(
    embedPhase,
    "PBXCopyFilesBuildPhase",
    addBuildFile(extensionProductRef, `${TARGET_NAME}.appex in Embed App Extensions`, {
      ATTRIBUTES: ["RemoveHeadersOnCopy"],
    }),
    `${TARGET_NAME}.appex in Embed App Extensions`,
  );
  addBuildFileToPhase(
    embedPhase,
    "PBXCopyFilesBuildPhase",
    addBuildFile(widgetProductRef, `${WIDGET_TARGET_NAME}.appex in Embed App Extensions`, {
      ATTRIBUTES: ["RemoveHeadersOnCopy"],
    }),
    `${WIDGET_TARGET_NAME}.appex in Embed App Extensions`,
  );
  removeDuplicateEmbeddedProducts(mainTarget, embedPhase, [extensionProductRef, widgetProductRef]);
  ensureTargetDependency(mainTarget, extensionTarget);
  ensureTargetDependency(mainTarget, widgetTarget);

  fs.writeFileSync(projectPath, project.writeSync());
}

module.exports = function withLockedCameraCapture(config) {
  config = withInfoPlist(config, (cfg) => {
    const activityTypes = new Set(cfg.modResults.NSUserActivityTypes || []);
    activityTypes.add("NSUserActivityTypeLockedCameraCapture");
    cfg.modResults.NSUserActivityTypes = Array.from(activityTypes);
    return cfg;
  });

  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      writeFileIfChanged(path.join(iosRoot, "Komorebi", "CameraCaptureIntent.swift"), CAMERA_INTENT_SWIFT);
      writeFileIfChanged(path.join(iosRoot, TARGET_NAME, "Info.plist"), EXTENSION_INFO_PLIST);
      writeFileIfChanged(path.join(iosRoot, TARGET_NAME, `${TARGET_NAME}.entitlements`), EMPTY_ENTITLEMENTS);
      writeFileIfChanged(path.join(iosRoot, TARGET_NAME, `${TARGET_NAME}.swift`), EXTENSION_MAIN_SWIFT);
      writeFileIfChanged(path.join(iosRoot, TARGET_NAME, "LockedCameraView.swift"), LOCKED_CAMERA_VIEW_SWIFT);
      writeFileIfChanged(path.join(iosRoot, WIDGET_TARGET_NAME, "Info.plist"), WIDGET_INFO_PLIST);
      writeFileIfChanged(path.join(iosRoot, WIDGET_TARGET_NAME, `${WIDGET_TARGET_NAME}.entitlements`), EMPTY_ENTITLEMENTS);
      writeFileIfChanged(path.join(iosRoot, WIDGET_TARGET_NAME, `${WIDGET_TARGET_NAME}.swift`), WIDGET_SWIFT);
      updateXcodeProject(path.join(iosRoot, "Komorebi.xcodeproj", "project.pbxproj"));
      return cfg;
    },
  ]);
};
