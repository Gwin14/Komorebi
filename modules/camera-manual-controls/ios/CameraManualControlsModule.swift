import ExpoModulesCore
import AVFoundation

// Locks the same physical AVCaptureDevice that react-native-vision-camera is
// already running (matched by `uniqueID`, i.e. the `device.id` passed from
// JS) to enable manual ISO, shutter speed, white balance and focus. This
// works because AVCaptureDevice configuration is keyed by the physical
// device, not by whichever AVCaptureSession currently owns it.
//
// Caveat: switching lens or facing makes vision-camera reconfigure its
// session, which can reset the device back to automatic mode. The JS hook
// (useManualCameraControls) re-applies the last manual values whenever the
// active device changes.
public class CameraManualControlsModule: Module {
  enum ManualControlsError: Error, LocalizedError {
    case deviceNotFound(String)
    case unsupported(String)

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      case .unsupported(let reason):
        return reason
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraManualControls")

    Function("isSupported") { () -> Bool in
      true
    }

    // Diagnóstico temporário: lê o estado real do AVCaptureDevice no
    // instante em que é chamado, para confirmar se o exposureMode/ISO/
    // duration ainda estão no valor manual travado ou se algo (ex: o
    // próprio vision-camera reconfigurando a sessão) já resetou para auto
    // antes da captura.
    AsyncFunction("getDebugState") { (deviceId: String) -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      return [
        "exposureMode": device.exposureMode.rawValue,
        "iso": device.iso,
        "exposureDurationSeconds": CMTimeGetSeconds(device.exposureDuration),
        "focusMode": device.focusMode.rawValue,
        "lensPosition": device.lensPosition,
        "whiteBalanceMode": device.whiteBalanceMode.rawValue,
        "isAdjustingExposure": device.isAdjustingExposure,
        "isAdjustingFocus": device.isAdjustingFocus,
        "isAdjustingWhiteBalance": device.isAdjustingWhiteBalance,
      ]
    }

    AsyncFunction("getCapabilities") { (deviceId: String) -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let format = device.activeFormat

      return [
        "minISO": format.minISO,
        "maxISO": format.maxISO,
        "minExposureDurationSeconds": CMTimeGetSeconds(format.minExposureDuration),
        "maxExposureDurationSeconds": CMTimeGetSeconds(format.maxExposureDuration),
        "supportsCustomExposure": device.isExposureModeSupported(.custom),
        "supportsLockedWhiteBalance": device.isWhiteBalanceModeSupported(.locked),
        "supportsLockedFocus": device.isFocusModeSupported(.locked),
        "maxWhiteBalanceGain": Double(device.maxWhiteBalanceGain),
        "minFocusLensPosition": 0.0,
        "maxFocusLensPosition": 1.0,
      ]
    }

    AsyncFunction("setManualExposure") { (deviceId: String, iso: Double, durationSeconds: Double) async throws in
      let device = try Self.findDevice(deviceId)

      guard device.isExposureModeSupported(.custom) else {
        throw ManualControlsError.unsupported("Custom exposure not supported on this device")
      }

      let format = device.activeFormat
      let clampedIso = Float(max(Double(format.minISO), min(Double(format.maxISO), iso)))
      let minDuration = CMTimeGetSeconds(format.minExposureDuration)
      let maxDuration = CMTimeGetSeconds(format.maxExposureDuration)
      let clampedDuration = max(minDuration, min(maxDuration, durationSeconds))
      let duration = CMTimeMakeWithSeconds(clampedDuration, preferredTimescale: 1_000_000)

      try device.lockForConfiguration()
      // Aguarda o completionHandler para só resolver a Promise quando o
      // sensor já tiver o ISO/obturador realmente aplicados, evitando que
      // uma captura disparada logo em seguida pegue o hardware em transição
      // (causa de fotos cujos metadados não batem com os sliders).
      await withCheckedContinuation { continuation in
        device.setExposureModeCustom(duration: duration, iso: clampedIso) { _ in
          continuation.resume()
        }
      }
      device.unlockForConfiguration()
    }

    AsyncFunction("setAutoExposure") { (deviceId: String) in
      let device = try Self.findDevice(deviceId)

      guard device.isExposureModeSupported(.continuousAutoExposure) else {
        throw ManualControlsError.unsupported("Continuous auto exposure not supported on this device")
      }

      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      device.exposureMode = .continuousAutoExposure
    }

    AsyncFunction("setManualWhiteBalance") { (deviceId: String, temperatureKelvin: Double, tint: Double) async throws in
      let device = try Self.findDevice(deviceId)

      guard device.isWhiteBalanceModeSupported(.locked) else {
        throw ManualControlsError.unsupported("Locked white balance not supported on this device")
      }

      let tempAndTint = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(
        temperature: Float(temperatureKelvin),
        tint: Float(tint)
      )
      var gains = device.deviceWhiteBalanceGains(for: tempAndTint)
      let maxGain = device.maxWhiteBalanceGain
      gains.redGain = max(1.0, min(maxGain, gains.redGain))
      gains.greenGain = max(1.0, min(maxGain, gains.greenGain))
      gains.blueGain = max(1.0, min(maxGain, gains.blueGain))

      try device.lockForConfiguration()
      await withCheckedContinuation { continuation in
        device.setWhiteBalanceModeLocked(with: gains) { _ in
          continuation.resume()
        }
      }
      device.unlockForConfiguration()
    }

    AsyncFunction("setAutoWhiteBalance") { (deviceId: String) in
      let device = try Self.findDevice(deviceId)

      guard device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) else {
        throw ManualControlsError.unsupported("Continuous auto white balance not supported on this device")
      }

      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      device.whiteBalanceMode = .continuousAutoWhiteBalance
    }

    AsyncFunction("setManualFocus") { (deviceId: String, lensPosition: Double) async throws in
      let device = try Self.findDevice(deviceId)

      guard device.isFocusModeSupported(.locked) else {
        throw ManualControlsError.unsupported("Locked focus not supported on this device")
      }

      let clampedPosition = Float(max(0.0, min(1.0, lensPosition)))

      try device.lockForConfiguration()
      await withCheckedContinuation { continuation in
        device.setFocusModeLocked(lensPosition: clampedPosition) { _ in
          continuation.resume()
        }
      }
      device.unlockForConfiguration()
    }

    AsyncFunction("focusAtPoint") { (deviceId: String, pointX: Double, pointY: Double) in
      let device = try Self.findDevice(deviceId)

      guard device.isFocusPointOfInterestSupported else {
        throw ManualControlsError.unsupported("Focus point of interest not supported on this device")
      }
      guard device.isFocusModeSupported(.autoFocus) else {
        throw ManualControlsError.unsupported("Autofocus not supported on this device")
      }

      let clampedX = max(0.0, min(1.0, pointX))
      let clampedY = max(0.0, min(1.0, pointY))

      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      // Intentionally only touches focus. VisionCamera's focus() also moves
      // exposure to autoExpose, which breaks manual ISO/shutter/WB controls.
      device.focusPointOfInterest = CGPoint(x: clampedX, y: clampedY)
      device.focusMode = .autoFocus
    }

    AsyncFunction("setAutoFocus") { (deviceId: String) in
      let device = try Self.findDevice(deviceId)

      guard device.isFocusModeSupported(.continuousAutoFocus) else {
        throw ManualControlsError.unsupported("Continuous autofocus not supported on this device")
      }

      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      device.focusMode = .continuousAutoFocus
    }
  }

  private static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw ManualControlsError.deviceNotFound(deviceId)
    }
    return device
  }
}
