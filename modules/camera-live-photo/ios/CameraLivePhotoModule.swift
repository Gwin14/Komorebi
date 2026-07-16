import ExpoModulesCore
import AVFoundation
import ImageIO
import Photos
import UniformTypeIdentifiers
import CoreImage

public class CameraLivePhotoModule: Module {
  enum LivePhotoError: Error, LocalizedError {
    case deviceNotFound(String)
    case cannotAddInput
    case cannotAddOutput
    case livePhotoNotSupported
    case captureSessionNotReady
    case captureFailed
    case missingPhotoData
    case missingMovieURL
    case photoLibraryDenied

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      case .cannotAddInput:
        return "Could not add camera input to capture session"
      case .cannotAddOutput:
        return "Could not add photo output to capture session"
      case .livePhotoNotSupported:
        return "Live Photo capture is not supported by this device"
      case .captureSessionNotReady:
        return "Live Photo camera session is not ready"
      case .captureFailed:
        return "Live Photo capture failed"
      case .missingPhotoData:
        return "Live Photo capture did not return photo data"
      case .missingMovieURL:
        return "Live Photo capture did not return paired video data"
      case .photoLibraryDenied:
        return "Photo library access was denied"
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraLivePhoto")

    Function("isSupported") { () -> Bool in
      if #available(iOS 10.0, *) {
        return true
      }
      return false
    }

    View(LivePhotoCameraView.self) {
      Events("onInitialized", "onError", "onSmileDetected", "onHistogramUpdated")

      Prop("deviceId") { (view, deviceId: String?) in
        view.deviceId = deviceId
      }

      Prop("flashMode") { (view, flashMode: String?) in
        view.flashMode = flashMode ?? "off"
      }

      Prop("isActive") { (view, isActive: Bool?) in
        view.isActive = isActive ?? true
      }

      Prop("smileDetectionEnabled") { (view, enabled: Bool?) in
        view.smileDetectionEnabled = enabled ?? false
      }

      Prop("histogramEnabled") { (view, enabled: Bool?) in
        view.histogramEnabled = enabled ?? false
      }
    }

    AsyncFunction("getCapabilities") { (deviceId: String) async throws -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let supportsLivePhoto = try Self.checkLivePhotoSupport(device: device)
      let libraryStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)

      return [
        "supportsLivePhotoCapture": supportsLivePhoto,
        "canSaveToPhotoLibrary": libraryStatus == .authorized || libraryStatus == .limited
      ]
    }

    AsyncFunction("captureLivePhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let deviceId = options["deviceId"] as? String else {
        throw LivePhotoError.captureFailed
      }

      let flashMode = options["flashMode"] as? String ?? "off"
      guard let view = await LivePhotoCameraView.activeView(for: deviceId) else {
        throw LivePhotoError.captureSessionNotReady
      }
      return try await view.captureLivePhoto(flashMode: flashMode)
    }

    AsyncFunction("saveLivePhotoToLibrary") { (options: [String: Any]) async throws -> [String: Any] in
      guard
        let photoUri = options["photoUri"] as? String,
        let movieUri = options["movieUri"] as? String
      else {
        throw LivePhotoError.captureFailed
      }

      try await Self.requestPhotoLibraryPermission()

      let photoURL = try Self.fileURL(from: photoUri)
      let movieURL = try Self.fileURL(from: movieUri)
      let originalPhotoURL = try (options["originalPhotoUri"] as? String).flatMap { try Self.fileURL(from: $0) }
      let preparedPhotoURL = Self.copyImageMetadata(
        from: originalPhotoURL,
        toProcessedPhotoAt: photoURL
      ) ?? photoURL
      let albumTitle = options["albumTitle"] as? String ?? "Komorebi"
      let localIdentifier = try await Self.saveLivePhotoToLibrary(
        photoURL: preparedPhotoURL,
        movieURL: movieURL,
        albumTitle: albumTitle
      )

      return [
        "localIdentifier": localIdentifier as Any,
        "savedToLibrary": true
      ]
    }
  }

  static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw LivePhotoError.deviceNotFound(deviceId)
    }
    return device
  }

  private static func checkLivePhotoSupport(device: AVCaptureDevice) throws -> Bool {
    let session = AVCaptureSession()
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .photo

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else {
      throw LivePhotoError.cannotAddInput
    }
    session.addInput(input)

    let output = AVCapturePhotoOutput()
    guard session.canAddOutput(output) else {
      throw LivePhotoError.cannotAddOutput
    }
    session.addOutput(output)

    return output.isLivePhotoCaptureSupported
  }

  static func requestPhotoLibraryPermission() async throws {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .authorized || status == .limited {
      return
    }

    let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard newStatus == .authorized || newStatus == .limited else {
      throw LivePhotoError.photoLibraryDenied
    }
  }

  static func fileURL(from uri: String) throws -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return url
    }

    return URL(fileURLWithPath: uri)
  }

  static func copyImageMetadata(from sourceURL: URL?, toProcessedPhotoAt processedURL: URL) -> URL? {
    guard
      let sourceURL,
      sourceURL != processedURL,
      let processedSource = CGImageSourceCreateWithURL(processedURL as CFURL, nil),
      let processedImage = CGImageSourceCreateImageAtIndex(processedSource, 0, nil),
      let metadataSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil)
    else {
      return nil
    }

    let destinationURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-live-processed-\(UUID().uuidString).jpg")
    let properties = Self.mergedImageProperties(
      metadataSource: metadataSource,
      processedSource: processedSource
    )
    guard let destination = CGImageDestinationCreateWithURL(
      destinationURL as CFURL,
      UTType.jpeg.identifier as CFString,
      1,
      nil
    ) else {
      return nil
    }

    CGImageDestinationAddImage(destination, processedImage, properties)
    return CGImageDestinationFinalize(destination) ? destinationURL : nil
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

  static func saveLivePhotoToLibrary(
    photoURL: URL,
    movieURL: URL,
    albumTitle: String? = nil
  ) async throws -> String? {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, Error>) in
      var placeholderIdentifier: String?

      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: photoURL, options: nil)
        request.addResource(with: .pairedVideo, fileURL: movieURL, options: nil)
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
          continuation.resume(throwing: LivePhotoError.captureFailed)
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

public final class LivePhotoCameraView: ExpoView {
  let onInitialized = EventDispatcher()
  let onError = EventDispatcher()
  let onSmileDetected = EventDispatcher()
  let onHistogramUpdated = EventDispatcher()

  private static weak var currentActiveView: LivePhotoCameraView?
  private let controller = LivePhotoCameraController()

  var deviceId: String? {
    didSet {
      updateSession()
    }
  }

  var flashMode: String = "off"

  var smileDetectionEnabled: Bool = false {
    didSet {
      controller.smileDetectionEnabled = smileDetectionEnabled
    }
  }

  var histogramEnabled: Bool = false {
    didSet {
      controller.histogramEnabled = histogramEnabled
    }
  }

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
    controller.onSmileDetected = { [weak self] in
      self?.onSmileDetected()
    }
    controller.onHistogramUpdated = { [weak self] bins in
      self?.onHistogramUpdated(["bins": bins])
    }
  }

  public override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  private var videoPreviewLayer: AVCaptureVideoPreviewLayer {
    layer as! AVCaptureVideoPreviewLayer
  }

  @MainActor
  static func activeView(for deviceId: String) -> LivePhotoCameraView? {
    guard let view = currentActiveView, view.deviceId == deviceId, view.isActive else {
      return nil
    }
    return view
  }

  func captureLivePhoto(flashMode: String) async throws -> [String: Any] {
    print("[LivePhotoNative] capture requested deviceId=\(deviceId ?? "nil") flashMode=\(flashMode)")
    let captureResult = try await controller.capture(flashMode: flashMode)
    print("[LivePhotoNative] capture finished photoURL=\(captureResult.photoURL.absoluteString) movieURL=\(captureResult.movieURL.absoluteString)")

    return [
      "photoUri": captureResult.photoURL.absoluteString,
      "movieUri": captureResult.movieURL.absoluteString,
      "localIdentifier": NSNull(),
      "savedToLibrary": false
    ]
  }

  private func updateSession() {
    guard let deviceId, isActive else {
      print("[LivePhotoNative] stopping session deviceId=\(deviceId ?? "nil") isActive=\(isActive)")
      if Self.currentActiveView === self {
        Self.currentActiveView = nil
      }
      controller.stop()
      return
    }

    Self.currentActiveView = self
    print("[LivePhotoNative] configure requested deviceId=\(deviceId) isActive=\(isActive)")
    controller.configure(
      deviceId: deviceId,
      onReady: { [weak self] in
        print("[LivePhotoNative] session ready deviceId=\(self?.deviceId ?? "nil")")
        self?.onInitialized()
      },
      onError: { [weak self] error in
        print("[LivePhotoNative] session error deviceId=\(self?.deviceId ?? "nil") error=\(error.localizedDescription)")
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

private final class LivePhotoCameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  struct CaptureResult {
    let photoURL: URL
    let movieURL: URL
  }

  let session = AVCaptureSession()

  private let output = AVCapturePhotoOutput()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let smileQueue = DispatchQueue(label: "dev.komorebi.live-photo.smile")
  private lazy var faceDetector = CIDetector(
    ofType: CIDetectorTypeFace,
    context: nil,
    options: [CIDetectorAccuracy: CIDetectorAccuracyLow]
  )
  var smileDetectionEnabled = false
  var onSmileDetected: (() -> Void)?
  var histogramEnabled = false
  var onHistogramUpdated: (([Double]) -> Void)?
  private var lastSmileAt = Date.distantPast
  private var lastHistogramAt = Date.distantPast
  private let sessionQueue = DispatchQueue(label: "dev.komorebi.live-photo.session")
  private var configuredDeviceId: String?
  private var isSessionReady = false
  private var inFlightDelegates: [LivePhotoCaptureDelegate] = []

  func configure(
    deviceId: String,
    onReady: @escaping () -> Void,
    onError: @escaping (Error) -> Void
  ) {
    sessionQueue.async { [weak self] in
      guard let self else { return }

      var configurationOpen = false
      do {
        print("[LivePhotoNative] configure start deviceId=\(deviceId) ready=\(self.isSessionReady) configuredDeviceId=\(self.configuredDeviceId ?? "nil") running=\(self.session.isRunning)")
        if self.isSessionReady && self.configuredDeviceId == deviceId {
          if !self.session.isRunning {
            print("[LivePhotoNative] restarting existing session deviceId=\(deviceId)")
            self.session.startRunning()
          }
          DispatchQueue.main.async(execute: onReady)
          return
        }

        self.session.beginConfiguration()
        configurationOpen = true

        self.session.inputs.forEach { self.session.removeInput($0) }
        self.session.outputs.forEach { self.session.removeOutput($0) }
        self.session.sessionPreset = .photo

        let device = try CameraLivePhotoModule.findDevice(deviceId)
        print("[LivePhotoNative] device found uniqueID=\(device.uniqueID) name=\(device.localizedName) position=\(device.position.rawValue)")
        let input = try AVCaptureDeviceInput(device: device)
        guard self.session.canAddInput(input) else {
          throw CameraLivePhotoModule.LivePhotoError.cannotAddInput
        }
        self.session.addInput(input)

        guard self.session.canAddOutput(self.output) else {
          throw CameraLivePhotoModule.LivePhotoError.cannotAddOutput
        }
        self.session.addOutput(self.output)

        if self.session.canAddOutput(self.videoOutput) {
          self.videoOutput.alwaysDiscardsLateVideoFrames = true
          self.videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
          ]
          self.videoOutput.setSampleBufferDelegate(self, queue: self.smileQueue)
          self.session.addOutput(self.videoOutput)
        }

        guard self.output.isLivePhotoCaptureSupported else {
          throw CameraLivePhotoModule.LivePhotoError.livePhotoNotSupported
        }

        self.output.isLivePhotoCaptureEnabled = true
        self.configuredDeviceId = deviceId
        self.isSessionReady = true
        self.session.commitConfiguration()
        configurationOpen = false
        self.session.startRunning()
        print("[LivePhotoNative] configure success deviceId=\(deviceId) liveSupported=\(self.output.isLivePhotoCaptureSupported) highResolutionEnabled=\(self.output.isHighResolutionCaptureEnabled) running=\(self.session.isRunning)")
        DispatchQueue.main.async(execute: onReady)
      } catch {
        if configurationOpen {
          self.session.commitConfiguration()
        }
        self.isSessionReady = false
        self.configuredDeviceId = nil
        print("[LivePhotoNative] configure failed deviceId=\(deviceId) error=\(error.localizedDescription)")
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
        print("[LivePhotoNative] stop running session configuredDeviceId=\(self.configuredDeviceId ?? "nil")")
        self.session.stopRunning()
      }
    }
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    let now = Date()
    if histogramEnabled,
       now.timeIntervalSince(lastHistogramAt) >= 0.2
    {
      lastHistogramAt = now
      let bins = makeHistogram(from: pixelBuffer)
      DispatchQueue.main.async { [weak self] in
        self?.onHistogramUpdated?(bins)
      }
    }

    guard smileDetectionEnabled,
          now.timeIntervalSince(lastSmileAt) >= 2.5,
          let detector = faceDetector
    else { return }

    let image = CIImage(cvPixelBuffer: pixelBuffer)
    let features = detector.features(
      in: image,
      options: [CIDetectorSmile: true]
    )
    guard features.contains(where: { ($0 as? CIFaceFeature)?.hasSmile == true }) else {
      return
    }

    lastSmileAt = now
    DispatchQueue.main.async { [weak self] in self?.onSmileDetected?() }
  }

  private func makeHistogram(from pixelBuffer: CVPixelBuffer) -> [Double] {
    let binCount = 64
    var bins = [Int](repeating: 0, count: binCount)

    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
    }

    var peak = 0

    if CVPixelBufferIsPlanar(pixelBuffer),
       CVPixelBufferGetPlaneCount(pixelBuffer) > 0,
       let lumaAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)
    {
      let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
      let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
      let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
      let sampleStep = max(1, Int(sqrt(Double(width * height) / 4096.0)))

      for y in stride(from: 0, to: height, by: sampleStep) {
        let row = lumaAddress
          .advanced(by: y * bytesPerRow)
          .assumingMemoryBound(to: UInt8.self)

        for x in stride(from: 0, to: width, by: sampleStep) {
          let bin = min(binCount - 1, Int(row[x]) >> 2)
          bins[bin] += 1
          peak = max(peak, bins[bin])
        }
      }
    } else if let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) {
      let width = CVPixelBufferGetWidth(pixelBuffer)
      let height = CVPixelBufferGetHeight(pixelBuffer)
      let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
      let sampleStep = max(1, Int(sqrt(Double(width * height) / 4096.0)))

      for y in stride(from: 0, to: height, by: sampleStep) {
        let row = baseAddress
          .advanced(by: y * bytesPerRow)
          .assumingMemoryBound(to: UInt8.self)

        for x in stride(from: 0, to: width, by: sampleStep) {
          let offset = x * 4
          let blue = Int(row[offset])
          let green = Int(row[offset + 1])
          let red = Int(row[offset + 2])
          let luminance = (29 * blue + 150 * green + 77 * red) >> 8
          let bin = min(binCount - 1, luminance >> 2)

          bins[bin] += 1
          peak = max(peak, bins[bin])
        }
      }
    }

    guard peak > 0 else {
      return [Double](repeating: 0, count: binCount)
    }

    return bins.map { Double($0) / Double(peak) }
  }

  func capture(flashMode: String) async throws -> CaptureResult {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async { [weak self] in
        guard let self, self.isSessionReady, self.session.isRunning else {
          print("[LivePhotoNative] capture blocked ready=\(self?.isSessionReady ?? false) running=\(self?.session.isRunning ?? false) configuredDeviceId=\(self?.configuredDeviceId ?? "nil")")
          continuation.resume(throwing: CameraLivePhotoModule.LivePhotoError.captureSessionNotReady)
          return
        }

        let photoURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("komorebi-live-\(UUID().uuidString).jpg")
        let movieURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("komorebi-live-\(UUID().uuidString).mov")

        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        settings.isHighResolutionPhotoEnabled = self.output.isHighResolutionCaptureEnabled
        let avFlashMode = CameraLivePhotoModule.toAVFlashMode(flashMode)
        if self.output.supportedFlashModes.contains(avFlashMode) {
          settings.flashMode = avFlashMode
        } else {
          print("[LivePhotoNative] requested flash unsupported flashMode=\(flashMode)")
        }
        settings.livePhotoMovieFileURL = movieURL

        print("[LivePhotoNative] capturePhoto now configuredDeviceId=\(self.configuredDeviceId ?? "nil") flashMode=\(settings.flashMode.rawValue) photoURL=\(photoURL.lastPathComponent) movieURL=\(movieURL.lastPathComponent)")
        let delegate = LivePhotoCaptureDelegate(photoURL: photoURL, movieURL: movieURL)
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

private final class LivePhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let photoURL: URL
  private let movieURL: URL
  private var photoData: Data?
  private var continuation: CheckedContinuation<LivePhotoCameraController.CaptureResult, Error>?
  var onFinish: (() -> Void)?

  init(photoURL: URL, movieURL: URL) {
    self.photoURL = photoURL
    self.movieURL = movieURL
    super.init()
  }

  func capture(
    with output: AVCapturePhotoOutput,
    settings: AVCapturePhotoSettings,
    continuation: CheckedContinuation<LivePhotoCameraController.CaptureResult, Error>
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
      print("[LivePhotoNative] didFinishProcessingPhoto error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    photoData = photo.fileDataRepresentation()
    print("[LivePhotoNative] didFinishProcessingPhoto hasData=\(photoData != nil) bytes=\(photoData?.count ?? 0)")
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishRecordingLivePhotoMovieForEventualFileAt outputFileURL: URL,
    resolvedSettings: AVCaptureResolvedPhotoSettings
  ) {}

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingLivePhotoToMovieFileAt outputFileURL: URL,
    duration: CMTime,
    photoDisplayTime: CMTime,
    resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      print("[LivePhotoNative] didFinishProcessingLivePhotoMovie error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }
    print("[LivePhotoNative] didFinishProcessingLivePhotoMovie output=\(outputFileURL.lastPathComponent) duration=\(duration.seconds) displayTime=\(photoDisplayTime.seconds)")
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      print("[LivePhotoNative] didFinishCapture error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    guard let photoData else {
      print("[LivePhotoNative] didFinishCapture missing photo data")
      finish(with: .failure(CameraLivePhotoModule.LivePhotoError.missingPhotoData))
      return
    }

    do {
      try photoData.write(to: photoURL, options: .atomic)
      guard FileManager.default.fileExists(atPath: movieURL.path) else {
        print("[LivePhotoNative] didFinishCapture missing movie file path=\(movieURL.path)")
        finish(with: .failure(CameraLivePhotoModule.LivePhotoError.missingMovieURL))
        return
      }
      print("[LivePhotoNative] didFinishCapture wrote photo=\(photoURL.lastPathComponent) movieExists=true")
      finish(with: .success(LivePhotoCameraController.CaptureResult(photoURL: photoURL, movieURL: movieURL)))
    } catch {
      print("[LivePhotoNative] didFinishCapture write error=\(error.localizedDescription)")
      finish(with: .failure(error))
    }
  }

  private func finish(with result: Result<LivePhotoCameraController.CaptureResult, Error>) {
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
