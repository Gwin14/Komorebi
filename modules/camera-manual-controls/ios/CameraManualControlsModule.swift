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

    AsyncFunction("getZoomCapabilities") { (deviceId: String) -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      return Self.zoomCapabilities(for: device)
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

  private static func zoomCapabilities(for device: AVCaptureDevice) -> [String: Any] {
    let constituents: [AVCaptureDevice]
    let switchFactors: [Double]

    if #available(iOS 13.0, *), device.isVirtualDevice {
      constituents = device.constituentDevices
      switchFactors = device.virtualDeviceSwitchOverVideoZoomFactors.map(\.doubleValue)
    } else {
      constituents = [device]
      switchFactors = []
    }

    // A virtual camera's zoom starts at its widest constituent. Every switch
    // factor is the native zoom at which the following constituent takes over.
    var constituentBaseFactors = [1.0]
    constituentBaseFactors.append(contentsOf: switchFactors)

    let wideIndex = constituents.firstIndex(where: {
      $0.deviceType == .builtInWideAngleCamera
    })
    let displayMultiplier: Double
    if #available(iOS 18.0, *) {
      displayMultiplier = Double(device.displayVideoZoomFactorMultiplier)
    } else if let wideIndex, wideIndex < constituentBaseFactors.count {
      displayMultiplier = 1.0 / constituentBaseFactors[wideIndex]
    } else {
      displayMultiplier = 1.0
    }

    // switchOverVideoZoomFactors are transition thresholds, not necessarily
    // the nominal full-field-of-view zoom shown by Camera.app. In particular,
    // recent iPhones may begin switching from ultra-wide around 0.9x even
    // though the main camera's user-facing native stop is exactly 1x.
    if let wideIndex,
       wideIndex < constituentBaseFactors.count,
       displayMultiplier > 0 {
      constituentBaseFactors[wideIndex] = 1.0 / displayMultiplier
    }

    let minZoom = Double(device.minAvailableVideoZoomFactor)
    let maxZoom = Double(device.maxAvailableVideoZoomFactor)
    var presets: [[String: Any]] = []

    for (index, constituent) in constituents.enumerated() {
      guard index < constituentBaseFactors.count else { continue }
      let baseFactor = constituentBaseFactors[index]
      Self.appendZoomPreset(
        zoomFactor: baseFactor,
        source: "physical",
        displayMultiplier: displayMultiplier,
        minZoom: minZoom,
        maxZoom: maxZoom,
        to: &presets
      )

      if #available(iOS 16.0, *) {
        for secondaryFactor in constituent.activeFormat.secondaryNativeResolutionZoomFactors {
          Self.appendZoomPreset(
            zoomFactor: baseFactor * Double(secondaryFactor),
            source: "secondary-native",
            displayMultiplier: displayMultiplier,
            minZoom: minZoom,
            maxZoom: maxZoom,
            to: &presets
          )
        }
      }
    }

    presets.sort {
      (($0["zoomFactor"] as? Double) ?? 0) < (($1["zoomFactor"] as? Double) ?? 0)
    }

    return [
      "minZoom": minZoom,
      "maxZoom": maxZoom,
      "displayZoomMultiplier": displayMultiplier,
      "isVirtualDevice": device.isVirtualDevice,
      "presets": presets,
    ]
  }

  private static func appendZoomPreset(
    zoomFactor: Double,
    source: String,
    displayMultiplier: Double,
    minZoom: Double,
    maxZoom: Double,
    to presets: inout [[String: Any]]
  ) {
    guard zoomFactor.isFinite,
          zoomFactor >= minZoom - 0.001,
          zoomFactor <= maxZoom + 0.001 else { return }

    let alreadyPresent = presets.contains {
      abs((($0["zoomFactor"] as? Double) ?? 0) - zoomFactor) < 0.01
    }
    guard !alreadyPresent else { return }

    presets.append([
      "zoomFactor": zoomFactor,
      "displayZoom": zoomFactor * displayMultiplier,
      "source": source,
    ])
  }
}
