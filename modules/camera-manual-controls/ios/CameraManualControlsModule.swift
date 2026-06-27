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

    AsyncFunction("setManualExposure") { (deviceId: String, iso: Double, durationSeconds: Double) in
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
      defer { device.unlockForConfiguration() }

      device.setExposureModeCustom(duration: duration, iso: clampedIso, completionHandler: nil)
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

    AsyncFunction("setManualWhiteBalance") { (deviceId: String, temperatureKelvin: Double, tint: Double) in
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
      defer { device.unlockForConfiguration() }

      device.setWhiteBalanceModeLocked(with: gains, completionHandler: nil)
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

    AsyncFunction("setManualFocus") { (deviceId: String, lensPosition: Double) in
      let device = try Self.findDevice(deviceId)

      guard device.isFocusModeSupported(.locked) else {
        throw ManualControlsError.unsupported("Locked focus not supported on this device")
      }

      let clampedPosition = Float(max(0.0, min(1.0, lensPosition)))

      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      device.setFocusModeLocked(lensPosition: clampedPosition, completionHandler: nil)
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
