import ExpoModulesCore
import Vision
import VisionCamera
import CoreImage
import AVFoundation
import ImageIO

@_silgen_name("CompositionScanEnsurePluginLinked")
private func ensureCompositionScanPluginLinked()

func compositionScanLog(_ message: @autoclosure () -> String) {
  print("[CompositionScan] Native \(message())")
}

private struct CompositionModelStatusRecord: Record {
  @Field var state = "not-downloaded"
  @Field var modelName = ""
  @Field var isReady = false
  @Field var isCompatible = false
  @Field var runtimeAvailable = false
  @Field var storageBytes: Int64 = 0
  @Field var progress: Double?
  @Field var error: String?

  init() {}

  init(_ value: [String: Any]) {
    state = value["state"] as? String ?? "not-downloaded"
    modelName = value["modelName"] as? String ?? ""
    isReady = value["isReady"] as? Bool ?? false
    isCompatible = value["isCompatible"] as? Bool ?? false
    runtimeAvailable = value["runtimeAvailable"] as? Bool ?? false
    storageBytes = (value["storageBytes"] as? NSNumber)?.int64Value ?? 0
    progress = (value["progress"] as? NSNumber)?.doubleValue
    error = value["error"] as? String
  }
}

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
    guard scanId == nil else {
      compositionScanLog("arm rejected id=\(id) active=\(scanId ?? "unknown")")
      return false
    }
    scanId = id
    cancelled = false
    compositionScanLog("armed id=\(id)")
    return true
  }

  func cancel(_ id: String) {
    lock.lock()
    guard scanId == id else {
      lock.unlock()
      compositionScanLog("cancel ignored id=\(id)")
      return
    }
    cancelled = true
    image = nil
    token = nil
    // Hold ownership until the copying/analyzing worker has actually exited.
    let pending = requests
    if !copying && !analyzing { resetLocked() }
    lock.unlock()
    compositionScanLog("cancelled id=\(id) pendingRequests=\(pending.count)")
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
      compositionScanLog("frame capture failed id=\(id) reduced=\(reduced != nil) cancelled=\(cancelled)")
      resetLocked()
      return nil
    }
    let imageToken = UUID().uuidString
    token = imageToken
    image = reduced
    imageRotation = rotation
    compositionScanLog("frame captured id=\(id) token=\(imageToken.prefix(8)) size=\(reduced.width)x\(reduced.height) rotation=\(rotation)")
    return imageToken
  }

  func analyze(_ imageToken: String, id: String, promise: Promise) {
    lock.lock()
    guard scanId == id, token == imageToken, !cancelled, !analyzing, let input = image else {
      lock.unlock()
      compositionScanLog("analyze rejected id=\(id) token=\(imageToken.prefix(8))")
      promise.reject("ERR_SCAN_IMAGE", "Scan image is no longer available")
      return
    }
    analyzing = true
    let rotation = imageRotation
    image = nil
    token = nil
    lock.unlock()
    compositionScanLog("analysis started id=\(id) size=\(input.width)x\(input.height)")

    queue.async {
      autoreleasepool {
        let analysisStartedAt = CFAbsoluteTimeGetCurrent()
        defer {
          self.lock.lock()
          self.resetLocked()
          self.lock.unlock()
        }
        let horizon = VNDetectHorizonRequest()
        let people = VNDetectHumanRectanglesRequest()
        people.upperBodyOnly = false
        let faces = VNDetectFaceLandmarksRequest()
        let saliency = VNGenerateAttentionBasedSaliencyImageRequest()
        let rectangles = VNDetectRectanglesRequest()
        rectangles.maximumObservations = 6
        rectangles.minimumConfidence = 0.7
        rectangles.minimumSize = 0.12
        rectangles.quadratureTolerance = 18
        let work: [VNRequest] = [horizon, people, faces, saliency, rectangles]
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
          let visionElapsed = Int((CFAbsoluteTimeGetCurrent() - analysisStartedAt) * 1_000)
          compositionScanLog(
            "Vision completed id=\(id) elapsedMs=\(visionElapsed) people=\(people.results?.count ?? 0) faces=\(faces.results?.count ?? 0) subjects=\(saliency.results?.first?.salientObjects?.count ?? 0) rectangles=\(rectangles.results?.count ?? 0) horizon=\(horizon.results?.first != nil)"
          )
          self.lock.lock()
          let wasCancelled = self.cancelled
          self.lock.unlock()
          guard !wasCancelled else {
            promise.reject("ERR_SCAN_CANCELLED", "Scan cancelled")
            return
          }
          // The semantic model is optional. Apple Vision always remains the
          // geometry source and the complete fallback when the model is not
          // installed, unsupported, or fails to answer.
          let judgement = MiniCPMCompositionService.shared.analyze(input)
          self.lock.lock()
          let cancelledAfterModel = self.cancelled
          self.lock.unlock()
          guard !cancelledAfterModel else {
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
          let geometryValue: [String: Any] = [
            "width": input.width,
            "height": input.height,
            "rotation": rotation,
            "mirrored": false
          ]
          let peopleValue: [[String: Any]] = (people.results ?? []).map { observation in
            subject(observation)
          }
          let facesValue: [[String: Any]] = (faces.results ?? []).map { face in
            var value = subject(face)
            if let yaw = face.yaw {
              value["yaw"] = yaw.doubleValue
            }
            return value
          }
          let subjectsValue: [[String: Any]] =
            (saliency.results?.first?.salientObjects ?? []).map { observation in
              subject(observation)
            }
          let rectanglesValue: [[String: Any]] = (rectangles.results ?? []).map { observation in
            subject(observation)
          }
          let judgementValue: Any = judgement ?? NSNull()
          let response: [String: Any] = [
            "geometry": geometryValue,
            "horizon": detectedHorizon,
            "people": peopleValue,
            "faces": facesValue,
            "subjects": subjectsValue,
            "rectangles": rectanglesValue,
            "judgement": judgementValue
          ]
          let totalElapsed = Int((CFAbsoluteTimeGetCurrent() - analysisStartedAt) * 1_000)
          compositionScanLog("analysis resolved id=\(id) elapsedMs=\(totalElapsed) modelJudgement=\(judgement != nil)")
          promise.resolve(response)
        } catch {
          compositionScanLog("analysis failed id=\(id) error=\(error.localizedDescription)")
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
    Events("onCompositionModelStatus")
    OnCreate { [weak self] in
      ensureCompositionScanPluginLinked()
      compositionScanLog("module created status=\(MiniCPMCompositionService.shared.status()["state"] as? String ?? "unknown")")
      MiniCPMCompositionService.shared.onStatus = { [weak self] status in
        compositionScanLog("status event state=\(status["state"] as? String ?? "unknown") progress=\(status["progress"] ?? "none") error=\(status["error"] ?? "none")")
        self?.sendEvent("onCompositionModelStatus", status)
      }
    }
    OnDestroy {
      CompositionScanSession.shared.cancelCurrent()
      MiniCPMCompositionService.shared.onStatus = nil
    }
    AsyncFunction("arm") { (id: String) -> Bool in
      CompositionScanSession.shared.arm(id)
    }
    AsyncFunction("analyze") { (token: String, id: String, promise: Promise) in
      CompositionScanSession.shared.analyze(token, id: id, promise: promise)
    }
    AsyncFunction("cancel") { (id: String) in
      CompositionScanSession.shared.cancel(id)
    }
    AsyncFunction("getCompositionModelStatus") { () -> CompositionModelStatusRecord in
      let status = MiniCPMCompositionService.shared.status()
      compositionScanLog("status requested state=\(status["state"] as? String ?? "unknown")")
      return CompositionModelStatusRecord(status)
    }
    AsyncFunction("downloadCompositionModel") { () throws -> Bool in
      try MiniCPMCompositionService.shared.startDownload()
    }
    AsyncFunction("cancelCompositionModelDownload") {
      MiniCPMCompositionService.shared.cancelDownload()
    }
    AsyncFunction("deleteCompositionModel") { () throws in
      try MiniCPMCompositionService.shared.removeModel()
    }
  }
}
