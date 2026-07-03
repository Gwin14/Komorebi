import ExpoModulesCore
import AVFoundation
import Photos

public class CameraLivePhotoModule: Module {
  enum LivePhotoError: Error, LocalizedError {
    case deviceNotFound(String)
    case cannotCreateInput
    case cannotAddInput
    case cannotAddOutput
    case livePhotoNotSupported
    case captureFailed
    case missingPhotoData
    case missingMovieURL
    case photoLibraryDenied

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      case .cannotCreateInput:
        return "Could not create camera input"
      case .cannotAddInput:
        return "Could not add camera input to capture session"
      case .cannotAddOutput:
        return "Could not add photo output to capture session"
      case .livePhotoNotSupported:
        return "Live Photo capture is not supported by this device"
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
      let device = try Self.findDevice(deviceId)
      return try await Self.captureLivePhoto(device: device, flashMode: flashMode)
    }
  }

  private static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw LivePhotoError.deviceNotFound(deviceId)
    }
    return device
  }

  private static func checkLivePhotoSupport(device: AVCaptureDevice) throws -> Bool {
    if device.position != .back {
      return false
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    defer { session.commitConfiguration() }

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

  private static func captureLivePhoto(
    device: AVCaptureDevice,
    flashMode: String
  ) async throws -> [String: Any] {
    guard device.position == .back else {
      throw LivePhotoError.livePhotoNotSupported
    }

    try await requestPhotoLibraryPermission()

    let session = AVCaptureSession()
    let output = AVCapturePhotoOutput()
    let sessionQueue = DispatchQueue(label: "dev.komorebi.live-photo.session")

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      sessionQueue.async {
        do {
          session.beginConfiguration()
          session.sessionPreset = .photo

          let input = try AVCaptureDeviceInput(device: device)
          guard session.canAddInput(input) else {
            throw LivePhotoError.cannotAddInput
          }
          session.addInput(input)

          guard session.canAddOutput(output) else {
            throw LivePhotoError.cannotAddOutput
          }
          session.addOutput(output)

          guard output.isLivePhotoCaptureSupported else {
            throw LivePhotoError.livePhotoNotSupported
          }
          output.isLivePhotoCaptureEnabled = true

          session.commitConfiguration()
          session.startRunning()
          continuation.resume()
        } catch {
          session.commitConfiguration()
          continuation.resume(throwing: error)
        }
      }
    }

    defer {
      sessionQueue.async {
        session.stopRunning()
      }
    }

    let photoURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-live-\(UUID().uuidString).jpg")
    let movieURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-live-\(UUID().uuidString).mov")

    let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
    settings.isHighResolutionPhotoEnabled = output.isHighResolutionCaptureEnabled
    if output.supportedFlashModes.contains(toAVFlashMode(flashMode)) {
      settings.flashMode = toAVFlashMode(flashMode)
    }
    settings.livePhotoMovieFileURL = movieURL

    let delegate = LivePhotoCaptureDelegate(photoURL: photoURL, movieURL: movieURL)
    let captureResult = try await delegate.capture(with: output, settings: settings)
    let localIdentifier = try await saveLivePhotoToLibrary(
      photoURL: captureResult.photoURL,
      movieURL: captureResult.movieURL
    )

    return [
      "photoUri": captureResult.photoURL.absoluteString,
      "movieUri": captureResult.movieURL.absoluteString,
      "localIdentifier": localIdentifier as Any,
      "savedToLibrary": true
    ]
  }

  private static func requestPhotoLibraryPermission() async throws {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .authorized || status == .limited {
      return
    }

    let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard newStatus == .authorized || newStatus == .limited else {
      throw LivePhotoError.photoLibraryDenied
    }
  }

  private static func saveLivePhotoToLibrary(
    photoURL: URL,
    movieURL: URL
  ) async throws -> String? {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, Error>) in
      var placeholderIdentifier: String?

      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: photoURL, options: nil)
        request.addResource(with: .pairedVideo, fileURL: movieURL, options: nil)
        placeholderIdentifier = request.placeholderForCreatedAsset?.localIdentifier
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

  private static func toAVFlashMode(_ mode: String) -> AVCaptureDevice.FlashMode {
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

private final class LivePhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  struct CaptureResult {
    let photoURL: URL
    let movieURL: URL
  }

  private let photoURL: URL
  private let movieURL: URL
  private var photoData: Data?
  private var continuation: CheckedContinuation<CaptureResult, Error>?

  init(photoURL: URL, movieURL: URL) {
    self.photoURL = photoURL
    self.movieURL = movieURL
    super.init()
  }

  func capture(
    with output: AVCapturePhotoOutput,
    settings: AVCapturePhotoSettings
  ) async throws -> CaptureResult {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      output.capturePhoto(with: settings, delegate: self)
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error {
      finish(with: .failure(error))
      return
    }

    photoData = photo.fileDataRepresentation()
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
      finish(with: .failure(error))
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      finish(with: .failure(error))
      return
    }

    guard let photoData else {
      finish(with: .failure(CameraLivePhotoModule.LivePhotoError.missingPhotoData))
      return
    }

    do {
      try photoData.write(to: photoURL, options: .atomic)
      guard FileManager.default.fileExists(atPath: movieURL.path) else {
        finish(with: .failure(CameraLivePhotoModule.LivePhotoError.missingMovieURL))
        return
      }
      finish(with: .success(CaptureResult(photoURL: photoURL, movieURL: movieURL)))
    } catch {
      finish(with: .failure(error))
    }
  }

  private func finish(with result: Result<CaptureResult, Error>) {
    guard let continuation else {
      return
    }

    self.continuation = nil
    switch result {
    case .success(let captureResult):
      continuation.resume(returning: captureResult)
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }
}
