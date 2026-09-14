import ExpoModulesCore
import Vision
import VisionCamera
import CoreImage
import AVFoundation
import ImageIO

@_silgen_name("CompositionScanEnsurePluginLinked")
private func ensureCompositionScanPluginLinked()

// The lock protects ownership; Vision and image work never execute under it.
// One slot is shared by Expo calls and the frame processor runtime.
final class CompositionScanSession {
  static let shared = CompositionScanSession()
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "komorebi.composition-scan", qos: .userInitiated)
  private let context = CIContext(options: [.cacheIntermediates: false])
  private var scanId: String?
  private var token: String?
  private var image: CGImage?
  private var imageRotation = 0
  private var copying = false
  private var analyzing = false
  private var cancelled = false
  private var requests: [VNRequest] = []

  func arm(_ id: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard scanId == nil else { return false }
    scanId = id
    cancelled = false
    return true
  }

  func cancel(_ id: String) {
    lock.lock()
    guard scanId == id else { lock.unlock(); return }
    cancelled = true
    image = nil
    token = nil
    // Hold ownership until the copying/analyzing worker has actually exited.
    let pending = requests
    if !copying && !analyzing { resetLocked() }
    lock.unlock()
    pending.forEach { $0.cancel() }
  }

  func cancelCurrent() {
    lock.lock()
    let current = scanId
    lock.unlock()
    if let current { cancel(current) }
  }

  private func resetLocked() {
    scanId = nil
    token = nil
    image = nil
    requests = []
    copying = false
    analyzing = false
    cancelled = false
  }

  func capture(_ frame: Frame, id: String, rotation: Int) -> String? {
    lock.lock()
    guard scanId == id, !cancelled, !copying, !analyzing, token == nil else {
      lock.unlock()
      return nil
    }
    copying = true
    lock.unlock()

    let reduced: CGImage? = autoreleasepool {
      guard let buffer = CMSampleBufferGetImageBuffer(frame.buffer) else { return nil }
      var source = CIImage(cvPixelBuffer: buffer)
      // Undo physical buffer mirroring, then invert the sensor connection's
      // rotation to portrait (the app's interface is locked to portrait).
      if frame.isMirrored { source = source.oriented(.upMirrored) }
      let orientation: CGImagePropertyOrientation
      switch frame.orientation {
      case .right: orientation = .left
      case .left: orientation = .right
      case .down: orientation = .down
      default: orientation = .up
      }
      source = source.oriented(orientation)
      // Analyze upright relative to the device, retaining the inverse transform
      // for the portrait UI. Faces must not reach Vision sideways.
      switch rotation {
      case 90: source = source.oriented(.left)
      case 180: source = source.oriented(.down)
      case 270: source = source.oriented(.right)
      default: break
      }
      let scale = min(1, 640 / max(source.extent.width, source.extent.height))
      source = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      return context.createCGImage(source, from: source.extent.integral)
    }

    lock.lock()
    defer { lock.unlock() }
    copying = false
    guard scanId == id, !cancelled, let reduced else {
      resetLocked()
      return nil
    }
    let imageToken = UUID().uuidString
    token = imageToken
    image = reduced
    imageRotation = rotation
    return imageToken
  }

  func analyze(_ imageToken: String, id: String, promise: Promise) {
    lock.lock()
    guard scanId == id, token == imageToken, !cancelled, !analyzing, let input = image else {
      lock.unlock()
      promise.reject("ERR_SCAN_IMAGE", "Scan image is no longer available")
      return
    }
    analyzing = true
    let rotation = imageRotation
    image = nil
    token = nil
    lock.unlock()

    queue.async {
      autoreleasepool {
        defer {
          self.lock.lock()
          self.resetLocked()
          self.lock.unlock()
        }
        let horizon = VNDetectHorizonRequest()
        let people = VNDetectHumanRectanglesRequest()
        people.upperBodyOnly = false
        let faces = VNDetectFaceRectanglesRequest()
        let work: [VNRequest] = [horizon, people, faces]
        self.lock.lock()
        self.requests = work
        let wasCancelled = self.cancelled
        self.lock.unlock()
        guard !wasCancelled else {
          promise.reject("ERR_SCAN_CANCELLED", "Scan cancelled")
          return
        }
        do {
          try VNImageRequestHandler(cgImage: input, orientation: .up).perform(work)
          self.lock.lock()
          let wasCancelled = self.cancelled
          self.lock.unlock()
          guard !wasCancelled else {
            promise.reject("ERR_SCAN_CANCELLED", "Scan cancelled")
            return
          }
          func subject(_ observation: VNDetectedObjectObservation) -> [String: Any] {
            let box = observation.boundingBox
            return ["confidence": observation.confidence, "rect": [
              "x": box.minX, "y": 1 - box.maxY,
              "width": box.width, "height": box.height
            ]]
          }
          let detectedHorizon: Any
          if let observation = horizon.results?.first {
            // Vision uses a bottom-left coordinate space; SVG uses top-left.
            detectedHorizon = ["angle": -Double(observation.angle),
                               "confidence": Double(observation.confidence)]
          } else {
            detectedHorizon = NSNull()
          }
          promise.resolve([
            "geometry": ["width": input.width, "height": input.height,
                         "rotation": rotation, "mirrored": false],
            "horizon": detectedHorizon,
            "people": (people.results ?? []).map { subject($0) },
            "faces": (faces.results ?? []).map { subject($0) }
          ])
        } catch {
          promise.reject("ERR_SCAN_ANALYSIS", "Local composition analysis failed: \(error.localizedDescription)")
        }
      }
    }
  }
}

@objc(CompositionScanPlugin)
public class CompositionScanPlugin: FrameProcessorPlugin {
  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any {
    guard let id = arguments?["scanId"] as? String else { return "" }
    let rotation = arguments?["rotation"] as? Int ?? 0
    return CompositionScanSession.shared.capture(frame, id: id, rotation: rotation) ?? ""
  }
}

public class CompositionScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CompositionScan")
    OnCreate { ensureCompositionScanPluginLinked() }
    OnDestroy { CompositionScanSession.shared.cancelCurrent() }
    AsyncFunction("arm") { (id: String) -> Bool in
      CompositionScanSession.shared.arm(id)
    }
    AsyncFunction("analyze") { (token: String, id: String, promise: Promise) in
      CompositionScanSession.shared.analyze(token, id: id, promise: promise)
    }
    AsyncFunction("cancel") { (id: String) in
      CompositionScanSession.shared.cancel(id)
    }
  }
}
