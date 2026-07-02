import ExpoModulesCore
import AVFoundation

// Small native capability bridge for RAW capture. The actual DNG capture is
// performed by VisionCamera's AVCapturePhotoOutput path, but JS uses this
// module to know when the active AVCaptureDevice can sensibly expose RAW modes.
public class CameraRawCaptureModule: Module {
  enum RawCaptureError: Error, LocalizedError {
    case deviceNotFound(String)

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraRawCapture")

    Function("isSupported") { () -> Bool in
      true
    }

    AsyncFunction("getCapabilities") { (deviceId: String) -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let supportsRaw = device.position == .back
      let supportsProRaw: Bool

      if #available(iOS 14.3, *) {
        supportsProRaw = supportsRaw
      } else {
        supportsProRaw = false
      }

      var supportedModes = ["off"]
      if supportsProRaw {
        supportedModes.append("proRaw")
      }
      if supportsRaw {
        supportedModes.append("raw")
      }

      return [
        "supportsRawCapture": supportsRaw,
        "supportsBayerRawCapture": supportsRaw,
        "supportsProRawCapture": supportsProRaw,
        "supportedModes": supportedModes,
      ]
    }
  }

  private static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw RawCaptureError.deviceNotFound(deviceId)
    }
    return device
  }
}
