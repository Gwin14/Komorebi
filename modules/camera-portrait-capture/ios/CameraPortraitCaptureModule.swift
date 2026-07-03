import ExpoModulesCore
import AVFoundation
import Photos

public class CameraPortraitCaptureModule: Module {
  enum PortraitCaptureError: Error, LocalizedError {
    case deviceNotFound(String)
    case cannotAddInput
    case cannotAddOutput
    case portraitCaptureNotSupported
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

    AsyncFunction("getCapabilities") { (deviceId: String) async throws -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let support = try Self.checkPortraitSupport(device: device)
      let libraryStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)

      return [
        "supportsPortraitCapture": support.supportsPortraitCapture,
        "supportsDepthData": support.supportsDepthData,
        "supportsPortraitEffectsMatte": support.supportsPortraitEffectsMatte,
        "canSaveToPhotoLibrary": libraryStatus == .authorized || libraryStatus == .limited
      ]
    }

    AsyncFunction("capturePortraitPhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let deviceId = options["deviceId"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      let flashMode = options["flashMode"] as? String ?? "off"
      let device = try Self.findDevice(deviceId)
      return try await Self.capturePortraitPhoto(device: device, flashMode: flashMode)
    }
  }

  private static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw PortraitCaptureError.deviceNotFound(deviceId)
    }
    return device
  }

  private static func checkPortraitSupport(device: AVCaptureDevice) throws -> PortraitSupport {
    if device.position != .back {
      return PortraitSupport(
        supportsDepthData: false,
        supportsPortraitEffectsMatte: false
      )
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    defer { session.commitConfiguration() }

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

  private static func capturePortraitPhoto(
    device: AVCaptureDevice,
    flashMode: String
  ) async throws -> [String: Any] {
    guard device.position == .back else {
      throw PortraitCaptureError.portraitCaptureNotSupported
    }

    try await requestPhotoLibraryPermission()

    let session = AVCaptureSession()
    let output = AVCapturePhotoOutput()
    let sessionQueue = DispatchQueue(label: "dev.komorebi.portrait-capture.session")

    let support = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<PortraitSupport, Error>) in
      sessionQueue.async {
        do {
          session.beginConfiguration()
          session.sessionPreset = .photo

          let input = try AVCaptureDeviceInput(device: device)
          guard session.canAddInput(input) else {
            throw PortraitCaptureError.cannotAddInput
          }
          session.addInput(input)

          guard session.canAddOutput(output) else {
            throw PortraitCaptureError.cannotAddOutput
          }
          session.addOutput(output)

          let support = PortraitSupport(
            supportsDepthData: output.isDepthDataDeliverySupported,
            supportsPortraitEffectsMatte: output.isPortraitEffectsMatteDeliverySupported
          )

          guard support.supportsPortraitCapture else {
            throw PortraitCaptureError.portraitCaptureNotSupported
          }

          output.isDepthDataDeliveryEnabled = support.supportsDepthData
          output.isPortraitEffectsMatteDeliveryEnabled = support.supportsPortraitEffectsMatte

          session.commitConfiguration()
          session.startRunning()
          continuation.resume(returning: support)
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

    let usesHevc = output.availablePhotoCodecTypes.contains(.hevc)
    let photoURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-portrait-\(UUID().uuidString).\(usesHevc ? "heic" : "jpg")")
    let codec = usesHevc ? AVVideoCodecType.hevc : AVVideoCodecType.jpeg
    let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])

    settings.isHighResolutionPhotoEnabled = output.isHighResolutionCaptureEnabled
    if output.supportedFlashModes.contains(toAVFlashMode(flashMode)) {
      settings.flashMode = toAVFlashMode(flashMode)
    }
    settings.isDepthDataDeliveryEnabled = support.supportsDepthData
    settings.isPortraitEffectsMatteDeliveryEnabled = support.supportsPortraitEffectsMatte
    settings.embedsDepthDataInPhoto = support.supportsDepthData
    settings.embedsPortraitEffectsMatteInPhoto = support.supportsPortraitEffectsMatte

    let delegate = PortraitPhotoCaptureDelegate(photoURL: photoURL)
    let captureResult = try await delegate.capture(with: output, settings: settings)
    let localIdentifier = try await savePhotoToLibrary(photoURL: captureResult.photoURL)

    return [
      "photoUri": captureResult.photoURL.absoluteString,
      "localIdentifier": localIdentifier as Any,
      "savedToLibrary": true,
      "depthDataEmbedded": support.supportsDepthData,
      "portraitEffectsMatteEmbedded": support.supportsPortraitEffectsMatte
    ]
  }

  private static func requestPhotoLibraryPermission() async throws {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .authorized || status == .limited {
      return
    }

    let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard newStatus == .authorized || newStatus == .limited else {
      throw PortraitCaptureError.photoLibraryDenied
    }
  }

  private static func savePhotoToLibrary(photoURL: URL) async throws -> String? {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, Error>) in
      var placeholderIdentifier: String?

      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: photoURL, options: nil)
        placeholderIdentifier = request.placeholderForCreatedAsset?.localIdentifier
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

private final class PortraitPhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  struct CaptureResult {
    let photoURL: URL
  }

  private let photoURL: URL
  private var photoData: Data?
  private var continuation: CheckedContinuation<CaptureResult, Error>?

  init(photoURL: URL) {
    self.photoURL = photoURL
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
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      finish(with: .failure(error))
      return
    }

    guard let photoData else {
      finish(with: .failure(CameraPortraitCaptureModule.PortraitCaptureError.missingPhotoData))
      return
    }

    do {
      try photoData.write(to: photoURL, options: .atomic)
      finish(with: .success(CaptureResult(photoURL: photoURL)))
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
