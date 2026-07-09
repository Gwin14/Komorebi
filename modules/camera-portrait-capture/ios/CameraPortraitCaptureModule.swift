import ExpoModulesCore
import AVFoundation
import ImageIO
import Photos
import UniformTypeIdentifiers

public class CameraPortraitCaptureModule: Module {
  enum PortraitCaptureError: Error, LocalizedError {
    case deviceNotFound(String)
    case cannotAddInput
    case cannotAddOutput
    case portraitCaptureNotSupported
    case captureSessionNotReady
    case captureFailed
    case missingPhotoData
    case photoLibraryDenied

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      case .cannotAddInput:
        return "Could not add camera input to capture session"
      case .cannotAddOutput:
        return "Could not add photo output to capture session"
      case .portraitCaptureNotSupported:
        return "Portrait capture is not supported by this device"
      case .captureSessionNotReady:
        return "Portrait camera session is not ready"
      case .captureFailed:
        return "Portrait photo capture failed"
      case .missingPhotoData:
        return "Portrait photo capture did not return photo data"
      case .photoLibraryDenied:
        return "Photo library access was denied"
      }
    }
  }

  struct PortraitSupport {
    let supportsDepthData: Bool
    let supportsPortraitEffectsMatte: Bool

    var supportsPortraitCapture: Bool {
      supportsDepthData || supportsPortraitEffectsMatte
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraPortraitCapture")

    Function("isSupported") { () -> Bool in
      if #available(iOS 12.0, *) {
        return true
      }
      return false
    }

    View(PortraitCameraView.self) {
      Events("onInitialized", "onError")

      Prop("deviceId") { (view, deviceId: String?) in
        view.deviceId = deviceId
      }

      Prop("flashMode") { (view, flashMode: String?) in
        view.flashMode = flashMode ?? "off"
      }

      Prop("isActive") { (view, isActive: Bool?) in
        view.isActive = isActive ?? true
      }
    }

    AsyncFunction("getCapabilities") { (deviceId: String) async throws -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let selection = Self.findPortraitCaptureDevice(preferred: device)
      let support = selection?.support ?? PortraitSupport(
        supportsDepthData: false,
        supportsPortraitEffectsMatte: false
      )
      let libraryStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)

      return [
        "supportsPortraitCapture": support.supportsPortraitCapture,
        "supportsDepthData": support.supportsDepthData,
        "supportsPortraitEffectsMatte": support.supportsPortraitEffectsMatte,
        "requestedDeviceId": device.uniqueID,
        "captureDeviceId": selection?.device.uniqueID ?? "",
        "captureDeviceName": selection?.device.localizedName ?? "",
        "canSaveToPhotoLibrary": libraryStatus == .authorized || libraryStatus == .limited
      ]
    }

    AsyncFunction("capturePortraitPhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let deviceId = options["deviceId"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      let flashMode = options["flashMode"] as? String ?? "off"
      guard let view = await PortraitCameraView.activeView(for: deviceId) else {
        throw PortraitCaptureError.captureSessionNotReady
      }
      return try await view.capturePortraitPhoto(flashMode: flashMode)
    }

    AsyncFunction("saveProcessedPortraitPhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let processedPhotoUri = options["processedPhotoUri"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      try await Self.requestPhotoLibraryPermission()

      let processedPhotoURL = try Self.fileURL(from: processedPhotoUri)
      let originalPhotoURL = try (options["originalPhotoUri"] as? String).flatMap { try Self.fileURL(from: $0) }
      let prepared = Self.copyPortraitAuxiliaryData(
        from: originalPhotoURL,
        toProcessedPhotoAt: processedPhotoURL
      )
      let albumTitle = options["albumTitle"] as? String ?? "Komorebi"
      let localIdentifier = try await Self.savePhotoToLibrary(
        photoURL: prepared.url,
        albumTitle: albumTitle
      )

      return [
        "localIdentifier": localIdentifier as Any,
        "savedToLibrary": true,
        "auxiliaryDataPreserved": prepared.auxiliaryDataPreserved
      ]
    }
  }

  static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw PortraitCaptureError.deviceNotFound(deviceId)
    }
    return device
  }

  static func checkPortraitSupport(device: AVCaptureDevice) throws -> PortraitSupport {
    if device.position != .back {
      return PortraitSupport(
        supportsDepthData: false,
        supportsPortraitEffectsMatte: false
      )
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .photo

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else {
      throw PortraitCaptureError.cannotAddInput
    }
    session.addInput(input)

    let output = AVCapturePhotoOutput()
    guard session.canAddOutput(output) else {
      throw PortraitCaptureError.cannotAddOutput
    }
    session.addOutput(output)

    return PortraitSupport(
      supportsDepthData: output.isDepthDataDeliverySupported,
      supportsPortraitEffectsMatte: output.isPortraitEffectsMatteDeliverySupported
    )
  }

  static func findPortraitCaptureDevice(
    preferred device: AVCaptureDevice
  ) -> (device: AVCaptureDevice, support: PortraitSupport)? {
    for candidate in portraitDeviceCandidates(preferred: device) {
      guard let support = try? checkPortraitSupport(device: candidate) else {
        continue
      }

      if support.supportsPortraitCapture {
        return (candidate, support)
      }
    }

    return nil
  }

  private static func portraitDeviceCandidates(preferred device: AVCaptureDevice) -> [AVCaptureDevice] {
    var candidates: [AVCaptureDevice] = []
    var seenDeviceIds = Set<String>()

    func append(_ candidate: AVCaptureDevice) {
      guard candidate.position == .back, !seenDeviceIds.contains(candidate.uniqueID) else {
        return
      }

      seenDeviceIds.insert(candidate.uniqueID)
      candidates.append(candidate)
    }

    append(device)

    var deviceTypes: [AVCaptureDevice.DeviceType] = [
      .builtInDualCamera,
      .builtInWideAngleCamera
    ]

    if #available(iOS 13.0, *) {
      deviceTypes.insert(.builtInDualWideCamera, at: 0)
      deviceTypes.insert(.builtInTripleCamera, at: 0)
    }

    let discoverySession = AVCaptureDevice.DiscoverySession(
      deviceTypes: deviceTypes,
      mediaType: .video,
      position: .back
    )

    discoverySession.devices.forEach(append)
    return candidates
  }

  static func requestPhotoLibraryPermission() async throws {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .authorized || status == .limited {
      return
    }

    let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard newStatus == .authorized || newStatus == .limited else {
      throw PortraitCaptureError.photoLibraryDenied
    }
  }

  static func fileURL(from uri: String) throws -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return url
    }

    return URL(fileURLWithPath: uri)
  }

  static func copyPortraitAuxiliaryData(
    from sourceURL: URL?,
    toProcessedPhotoAt processedURL: URL
  ) -> (url: URL, auxiliaryDataPreserved: Bool) {
    guard
      let sourceURL,
      sourceURL != processedURL,
      let processedSource = CGImageSourceCreateWithURL(processedURL as CFURL, nil),
      let processedImage = CGImageSourceCreateImageAtIndex(processedSource, 0, nil),
      let originalSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil)
    else {
      return (processedURL, false)
    }

    let destinationURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-portrait-processed-\(UUID().uuidString).heic")
    let properties = Self.mergedImageProperties(
      metadataSource: originalSource,
      processedSource: processedSource
    )

    guard let destination = CGImageDestinationCreateWithURL(
      destinationURL as CFURL,
      UTType.heic.identifier as CFString,
      1,
      nil
    ) else {
      return (processedURL, false)
    }

    CGImageDestinationAddImage(destination, processedImage, properties)

    var auxiliaryDataPreserved = false
    let auxiliaryTypes: [CFString] = [
      kCGImageAuxiliaryDataTypeDisparity,
      kCGImageAuxiliaryDataTypeDepth,
      kCGImageAuxiliaryDataTypePortraitEffectsMatte
    ]

    for auxiliaryType in auxiliaryTypes {
      if let auxiliaryData = CGImageSourceCopyAuxiliaryDataInfoAtIndex(
        originalSource,
        0,
        auxiliaryType
      ) {
        CGImageDestinationAddAuxiliaryDataInfo(
          destination,
          auxiliaryType,
          auxiliaryData
        )
        auxiliaryDataPreserved = true
      }
    }

    guard CGImageDestinationFinalize(destination) else {
      return (processedURL, false)
    }

    return (destinationURL, auxiliaryDataPreserved)
  }

  static func mergedImageProperties(
    metadataSource: CGImageSource,
    processedSource: CGImageSource
  ) -> CFDictionary {
    var merged = (CGImageSourceCopyPropertiesAtIndex(metadataSource, 0, nil) as? [String: Any]) ?? [:]
    let processed = (CGImageSourceCopyPropertiesAtIndex(processedSource, 0, nil) as? [String: Any]) ?? [:]

    for key in [
      kCGImagePropertyGPSDictionary as String,
      kCGImagePropertyExifDictionary as String,
      kCGImagePropertyTIFFDictionary as String
    ] {
      guard let processedValue = processed[key] else {
        continue
      }

      if
        let existingDictionary = merged[key] as? [String: Any],
        let processedDictionary = processedValue as? [String: Any]
      {
        merged[key] = existingDictionary.merging(processedDictionary) { _, processed in processed }
      } else {
        merged[key] = processedValue
      }
    }

    merged[kCGImagePropertyOrientation as String] = 1
    return merged as CFDictionary
  }

  static func savePhotoToLibrary(
    photoURL: URL,
    albumTitle: String? = nil
  ) async throws -> String? {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, Error>) in
      var placeholderIdentifier: String?

      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: photoURL, options: nil)
        placeholderIdentifier = request.placeholderForCreatedAsset?.localIdentifier

        if
          let albumTitle,
          let placeholder = request.placeholderForCreatedAsset
        {
          Self.addAsset(placeholder, toAlbumNamed: albumTitle)
        }
      }, completionHandler: { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: placeholderIdentifier)
        } else {
          continuation.resume(throwing: PortraitCaptureError.captureFailed)
        }
      })
    }
  }

  static func addAsset(_ assetPlaceholder: PHObjectPlaceholder, toAlbumNamed albumTitle: String) {
    let fetchOptions = PHFetchOptions()
    fetchOptions.predicate = NSPredicate(format: "title = %@", albumTitle)
    let collections = PHAssetCollection.fetchAssetCollections(
      with: .album,
      subtype: .albumRegular,
      options: fetchOptions
    )

    if let album = collections.firstObject {
      let changeRequest = PHAssetCollectionChangeRequest(for: album)
      changeRequest?.addAssets([assetPlaceholder] as NSArray)
      return
    }

    let createRequest = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
      withTitle: albumTitle
    )
    createRequest.addAssets([assetPlaceholder] as NSArray)
  }

  static func toAVFlashMode(_ mode: String) -> AVCaptureDevice.FlashMode {
    switch mode {
    case "on":
      return .on
    case "auto":
      return .auto
    default:
      return .off
    }
  }
}

public final class PortraitCameraView: ExpoView {
  let onInitialized = EventDispatcher()
  let onError = EventDispatcher()

  private static weak var currentActiveView: PortraitCameraView?
  private let controller = PortraitCameraController()

  var deviceId: String? {
    didSet {
      updateSession()
    }
  }

  var flashMode: String = "off"

  var isActive: Bool = true {
    didSet {
      updateSession()
    }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    backgroundColor = .black
    videoPreviewLayer.videoGravity = .resizeAspectFill
    videoPreviewLayer.session = controller.session
  }

  public override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  private var videoPreviewLayer: AVCaptureVideoPreviewLayer {
    layer as! AVCaptureVideoPreviewLayer
  }

  @MainActor
  static func activeView(for deviceId: String) -> PortraitCameraView? {
    guard let view = currentActiveView, view.deviceId == deviceId, view.isActive else {
      return nil
    }
    return view
  }

  func capturePortraitPhoto(flashMode: String) async throws -> [String: Any] {
    print("[PortraitNative] capture requested deviceId=\(deviceId ?? "nil") flashMode=\(flashMode)")
    let captureResult = try await controller.capture(flashMode: flashMode)
    print("[PortraitNative] capture finished photoURL=\(captureResult.photoURL.absoluteString) depth=\(captureResult.support.supportsDepthData) matte=\(captureResult.support.supportsPortraitEffectsMatte)")

    return [
      "photoUri": captureResult.photoURL.absoluteString,
      "localIdentifier": NSNull(),
      "savedToLibrary": false,
      "depthDataEmbedded": captureResult.support.supportsDepthData,
      "portraitEffectsMatteEmbedded": captureResult.support.supportsPortraitEffectsMatte,
      "requestedDeviceId": captureResult.requestedDeviceId,
      "captureDeviceId": captureResult.captureDeviceId,
      "captureDeviceName": captureResult.captureDeviceName
    ]
  }

  private func updateSession() {
    guard let deviceId, isActive else {
      print("[PortraitNative] stopping session deviceId=\(deviceId ?? "nil") isActive=\(isActive)")
      if Self.currentActiveView === self {
        Self.currentActiveView = nil
      }
      controller.stop()
      return
    }

    Self.currentActiveView = self
    print("[PortraitNative] configure requested deviceId=\(deviceId) isActive=\(isActive)")
    controller.configure(
      requestedDeviceId: deviceId,
      onReady: { [weak self] in
        print("[PortraitNative] session ready deviceId=\(self?.deviceId ?? "nil")")
        self?.onInitialized()
      },
      onError: { [weak self] error in
        print("[PortraitNative] session error deviceId=\(self?.deviceId ?? "nil") error=\(error.localizedDescription)")
        self?.onError(["message": error.localizedDescription])
      }
    )
  }

  deinit {
    if Self.currentActiveView === self {
      Self.currentActiveView = nil
    }
    controller.stop()
  }
}

private final class PortraitCameraController {
  struct CaptureResult {
    let photoURL: URL
    let support: CameraPortraitCaptureModule.PortraitSupport
    let requestedDeviceId: String
    let captureDeviceId: String
    let captureDeviceName: String
  }

  let session = AVCaptureSession()

  private let output = AVCapturePhotoOutput()
  private let sessionQueue = DispatchQueue(label: "dev.komorebi.portrait-capture.session")
  private var configuredRequestedDeviceId: String?
  private var activeCaptureDevice: AVCaptureDevice?
  private var activeSupport: CameraPortraitCaptureModule.PortraitSupport?
  private var isSessionReady = false
  private var inFlightDelegates: [PortraitPhotoCaptureDelegate] = []

  func configure(
    requestedDeviceId: String,
    onReady: @escaping () -> Void,
    onError: @escaping (Error) -> Void
  ) {
    sessionQueue.async { [weak self] in
      guard let self else { return }

      var configurationOpen = false
      do {
        print("[PortraitNative] configure start requestedDeviceId=\(requestedDeviceId) ready=\(self.isSessionReady) configuredRequestedDeviceId=\(self.configuredRequestedDeviceId ?? "nil") running=\(self.session.isRunning)")
        if self.isSessionReady && self.configuredRequestedDeviceId == requestedDeviceId {
          if !self.session.isRunning {
            print("[PortraitNative] restarting existing session requestedDeviceId=\(requestedDeviceId)")
            self.session.startRunning()
          }
          DispatchQueue.main.async(execute: onReady)
          return
        }

        let requestedDevice = try CameraPortraitCaptureModule.findDevice(requestedDeviceId)
        print("[PortraitNative] requested device found uniqueID=\(requestedDevice.uniqueID) name=\(requestedDevice.localizedName) position=\(requestedDevice.position.rawValue)")
        guard let selection = CameraPortraitCaptureModule.findPortraitCaptureDevice(preferred: requestedDevice) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
        }
        print("[PortraitNative] selected capture device uniqueID=\(selection.device.uniqueID) name=\(selection.device.localizedName) depth=\(selection.support.supportsDepthData) matte=\(selection.support.supportsPortraitEffectsMatte)")

        self.session.beginConfiguration()
        configurationOpen = true

        self.session.inputs.forEach { self.session.removeInput($0) }
        self.session.outputs.forEach { self.session.removeOutput($0) }
        self.session.sessionPreset = .photo

        let input = try AVCaptureDeviceInput(device: selection.device)
        guard self.session.canAddInput(input) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.cannotAddInput
        }
        self.session.addInput(input)

        guard self.session.canAddOutput(self.output) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.cannotAddOutput
        }
        self.session.addOutput(self.output)

        let configuredSupport = CameraPortraitCaptureModule.PortraitSupport(
          supportsDepthData: self.output.isDepthDataDeliverySupported && selection.support.supportsDepthData,
          supportsPortraitEffectsMatte: self.output.isPortraitEffectsMatteDeliverySupported && selection.support.supportsPortraitEffectsMatte
        )

        guard configuredSupport.supportsPortraitCapture else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
        }

        self.output.isDepthDataDeliveryEnabled = configuredSupport.supportsDepthData
        self.output.isPortraitEffectsMatteDeliveryEnabled = configuredSupport.supportsPortraitEffectsMatte

        self.configuredRequestedDeviceId = requestedDeviceId
        self.activeCaptureDevice = selection.device
        self.activeSupport = configuredSupport
        self.isSessionReady = true
        self.session.commitConfiguration()
        configurationOpen = false
        self.session.startRunning()
        print("[PortraitNative] configure success requestedDeviceId=\(requestedDeviceId) captureDeviceId=\(selection.device.uniqueID) depth=\(configuredSupport.supportsDepthData) matte=\(configuredSupport.supportsPortraitEffectsMatte) running=\(self.session.isRunning)")
        DispatchQueue.main.async(execute: onReady)
      } catch {
        if configurationOpen {
          self.session.commitConfiguration()
        }
        self.isSessionReady = false
        self.configuredRequestedDeviceId = nil
        self.activeCaptureDevice = nil
        self.activeSupport = nil
        print("[PortraitNative] configure failed requestedDeviceId=\(requestedDeviceId) error=\(error.localizedDescription)")
        DispatchQueue.main.async {
          onError(error)
        }
      }
    }
  }

  func stop() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.session.isRunning {
        print("[PortraitNative] stop running session configuredRequestedDeviceId=\(self.configuredRequestedDeviceId ?? "nil")")
        self.session.stopRunning()
      }
    }
  }

  func capture(flashMode: String) async throws -> CaptureResult {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async { [weak self] in
        guard
          let self,
          self.isSessionReady,
          self.session.isRunning,
          let support = self.activeSupport,
          let captureDevice = self.activeCaptureDevice,
          let requestedDeviceId = self.configuredRequestedDeviceId
        else {
          print("[PortraitNative] capture blocked ready=\(self?.isSessionReady ?? false) running=\(self?.session.isRunning ?? false) configuredRequestedDeviceId=\(self?.configuredRequestedDeviceId ?? "nil")")
          continuation.resume(throwing: CameraPortraitCaptureModule.PortraitCaptureError.captureSessionNotReady)
          return
        }

        let usesHevc = self.output.availablePhotoCodecTypes.contains(.hevc)
        let photoURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("komorebi-portrait-\(UUID().uuidString).\(usesHevc ? "heic" : "jpg")")
        let codec = usesHevc ? AVVideoCodecType.hevc : AVVideoCodecType.jpeg
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])

        settings.isHighResolutionPhotoEnabled = self.output.isHighResolutionCaptureEnabled
        let avFlashMode = CameraPortraitCaptureModule.toAVFlashMode(flashMode)
        if self.output.supportedFlashModes.contains(avFlashMode) {
          settings.flashMode = avFlashMode
        } else {
          print("[PortraitNative] requested flash unsupported flashMode=\(flashMode)")
        }
        settings.isDepthDataDeliveryEnabled = support.supportsDepthData
        settings.isPortraitEffectsMatteDeliveryEnabled = support.supportsPortraitEffectsMatte
        settings.embedsDepthDataInPhoto = support.supportsDepthData
        settings.embedsPortraitEffectsMatteInPhoto = support.supportsPortraitEffectsMatte

        let delegate = PortraitPhotoCaptureDelegate(
          photoURL: photoURL,
          support: support,
          requestedDeviceId: requestedDeviceId,
          captureDeviceId: captureDevice.uniqueID,
          captureDeviceName: captureDevice.localizedName
        )
        print("[PortraitNative] capturePhoto now requestedDeviceId=\(requestedDeviceId) captureDeviceId=\(captureDevice.uniqueID) flashMode=\(settings.flashMode.rawValue) photoURL=\(photoURL.lastPathComponent) codec=\(codec.rawValue) depth=\(support.supportsDepthData) matte=\(support.supportsPortraitEffectsMatte)")
        delegate.onFinish = { [weak self, weak delegate] in
          guard let self, let delegate else { return }
          self.sessionQueue.async {
            self.inFlightDelegates.removeAll { $0 === delegate }
          }
        }
        self.inFlightDelegates.append(delegate)
        delegate.capture(with: self.output, settings: settings, continuation: continuation)
      }
    }
  }
}

private final class PortraitPhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let photoURL: URL
  private let support: CameraPortraitCaptureModule.PortraitSupport
  private let requestedDeviceId: String
  private let captureDeviceId: String
  private let captureDeviceName: String
  private var photoData: Data?
  private var continuation: CheckedContinuation<PortraitCameraController.CaptureResult, Error>?
  var onFinish: (() -> Void)?

  init(
    photoURL: URL,
    support: CameraPortraitCaptureModule.PortraitSupport,
    requestedDeviceId: String,
    captureDeviceId: String,
    captureDeviceName: String
  ) {
    self.photoURL = photoURL
    self.support = support
    self.requestedDeviceId = requestedDeviceId
    self.captureDeviceId = captureDeviceId
    self.captureDeviceName = captureDeviceName
    super.init()
  }

  func capture(
    with output: AVCapturePhotoOutput,
    settings: AVCapturePhotoSettings,
    continuation: CheckedContinuation<PortraitCameraController.CaptureResult, Error>
  ) {
    self.continuation = continuation
    output.capturePhoto(with: settings, delegate: self)
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error {
      print("[PortraitNative] didFinishProcessingPhoto error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    photoData = photo.fileDataRepresentation()
    print("[PortraitNative] didFinishProcessingPhoto hasData=\(photoData != nil) bytes=\(photoData?.count ?? 0)")
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      print("[PortraitNative] didFinishCapture error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    guard let photoData else {
      print("[PortraitNative] didFinishCapture missing photo data")
      finish(with: .failure(CameraPortraitCaptureModule.PortraitCaptureError.missingPhotoData))
      return
    }

    do {
      try photoData.write(to: photoURL, options: .atomic)
      print("[PortraitNative] didFinishCapture wrote photo=\(photoURL.lastPathComponent)")
      finish(with: .success(PortraitCameraController.CaptureResult(
        photoURL: photoURL,
        support: support,
        requestedDeviceId: requestedDeviceId,
        captureDeviceId: captureDeviceId,
        captureDeviceName: captureDeviceName
      )))
    } catch {
      print("[PortraitNative] didFinishCapture write error=\(error.localizedDescription)")
      finish(with: .failure(error))
    }
  }

  private func finish(with result: Result<PortraitCameraController.CaptureResult, Error>) {
    guard let continuation else {
      return
    }

    self.continuation = nil
    onFinish?()
    onFinish = nil
    switch result {
    case .success(let captureResult):
      continuation.resume(returning: captureResult)
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }
}
