import ExpoModulesCore
import Vision
import VisionCamera
import CoreImage
import AVFoundation
import ImageIO
import simd

@_silgen_name("CompositionScanEnsurePluginLinked")
private func ensureCompositionScanPluginLinked()

func compositionScanLog(_ message: @autoclosure () -> String) {
  print("[CompositionScan] Native \(message())")
}

private let compositionImageContext = CIContext(options: [.cacheIntermediates: false])

private func compositionImage(from frame: Frame, rotation: Int, maxDimension: CGFloat) -> CGImage? {
  guard let buffer = CMSampleBufferGetImageBuffer(frame.buffer) else { return nil }
  var source = CIImage(cvPixelBuffer: buffer)
  if frame.isMirrored { source = source.oriented(.upMirrored) }
  let orientation: CGImagePropertyOrientation
  switch frame.orientation {
  case .right: orientation = .left
  case .left: orientation = .right
  case .down: orientation = .down
  default: orientation = .up
  }
  source = source.oriented(orientation)
  switch rotation {
  case 90: source = source.oriented(.left)
  case 180: source = source.oriented(.down)
  case 270: source = source.oriented(.right)
  default: break
  }
  let scale = min(1, maxDimension / max(source.extent.width, source.extent.height))
  source = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  return compositionImageContext.createCGImage(source, from: source.extent.integral)
}

private func resizedCompositionImage(_ image: CGImage, maxDimension: CGFloat) -> CGImage? {
  let scale = min(1, maxDimension / max(CGFloat(image.width), CGFloat(image.height)))
  let source = CIImage(cgImage: image).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  return compositionImageContext.createCGImage(source, from: source.extent.integral)
}

private func warmUpCompositionVision() {
  let extent = CGRect(x: 0, y: 0, width: 64, height: 64)
  let source = CIImage(color: CIColor(red: 0.18, green: 0.18, blue: 0.18, alpha: 1)).cropped(to: extent)
  guard let image = compositionImageContext.createCGImage(source, from: extent) else { return }
  let requests: [VNRequest] = [
    VNDetectHorizonRequest(),
    VNDetectHumanRectanglesRequest(),
    VNDetectFaceLandmarksRequest(),
    VNGenerateAttentionBasedSaliencyImageRequest(),
    VNDetectRectanglesRequest(),
  ]
  do {
    try VNImageRequestHandler(cgImage: image, orientation: .up).perform(requests)
    compositionScanLog("Vision warmup completed")
  } catch {
    // A imagem sintética pode não produzir observações; o carregamento do
    // framework ainda acontece e o scanner real continua sendo o fallback.
    compositionScanLog("Vision warmup completed with no observations error=\(error.localizedDescription)")
  }
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

private struct CompositionRecentAdviceRecord: Record {
  @Field var topic = ""
  @Field var message = ""
}

private struct CompositionSubjectPointRecord: Record {
  @Field var x = 0.5
  @Field var y = 0.5
}

private struct CompositionAnalysisContextRecord: Record {
  @Field var recentAdvice: [CompositionRecentAdviceRecord] = []
  @Field var frameAspectRatio: Double = 0.75
  @Field var subjectPoint: CompositionSubjectPointRecord?
  @Field var previewWidth: Double = 0
  @Field var previewHeight: Double = 0
}

private struct PhotoIntelligenceOptionsRecord: Record {
  @Field var imageUri = ""
  @Field var generateTags = false
  @Field var generateFilename = false
}

private struct PhotoIntelligenceResultRecord: Record {
  @Field var tags: [String] = []
  @Field var filenameStem: String?
  @Field var modelName = ""

  init() {}

  init(_ value: [String: Any]) {
    tags = value["tags"] as? [String] ?? []
    filenameStem = value["filenameStem"] as? String
    modelName = value["modelName"] as? String ?? ""
  }
}

private func compositionAnalysisPoint(_ point: [String: Double]?, imageWidth: Int,
                                      imageHeight: Int, rotation: Int,
                                      previewWidth: Double, previewHeight: Double) -> [String: Double]? {
  guard var x = point?["x"], var y = point?["y"],
        x.isFinite, y.isFinite, previewWidth > 0, previewHeight > 0,
        imageWidth > 0, imageHeight > 0 else { return nil }
  let rotated = rotation == 90 || rotation == 270
  let displayWidth = rotated ? Double(imageHeight) : Double(imageWidth)
  let displayHeight = rotated ? Double(imageWidth) : Double(imageHeight)
  let scale = max(previewWidth / displayWidth, previewHeight / displayHeight)
  let offsetX = (previewWidth - displayWidth * scale) / 2
  let offsetY = (previewHeight - displayHeight * scale) / 2
  x = (min(1, max(0, x)) * previewWidth - offsetX) / (displayWidth * scale)
  y = (min(1, max(0, y)) * previewHeight - offsetY) / (displayHeight * scale)
  switch rotation {
  case 90: (x, y) = (y, 1 - x)
  case 180: (x, y) = (1 - x, 1 - y)
  case 270: (x, y) = (1 - y, x)
  default: break
  }
  return ["x": min(1, max(0, x)), "y": min(1, max(0, y))]
}

final class CompositionScanTracker {
  static let shared = CompositionScanTracker()

  var onUpdate: (([String: Any]) -> Void)?

  private let lock = NSLock()
  private let queue = DispatchQueue(label: "komorebi.composition-tracking", qos: .userInitiated)
  private var scanId: String?
  private var reference: CGImage?
  private var latest: CGImage?
  private var active = false
  private var busy = false
  private var lost = false
  private var failures = 0
  private var handler = VNSequenceRequestHandler()
  private var request = VNTrackHomographicImageRegistrationRequest()
  private var cumulative = matrix_identity_float3x3

  func begin(_ id: String, reference: CGImage) {
    lock.lock()
    scanId = id
    self.reference = reference
    latest = nil
    active = false
    busy = false
    lost = false
    failures = 0
    lock.unlock()
    queue.async {
      self.lock.lock()
      guard self.scanId == id else { self.lock.unlock(); return }
      self.handler = VNSequenceRequestHandler()
      self.request = VNTrackHomographicImageRegistrationRequest()
      self.cumulative = matrix_identity_float3x3
      self.lock.unlock()
    }
    compositionScanLog("tracking prepared id=\(id) size=\(reference.width)x\(reference.height)")
  }

  func offer(_ frame: Frame, id: String, rotation: Int) {
    lock.lock()
    let accepts = scanId == id && !lost
    lock.unlock()
    guard accepts, let image = compositionImage(from: frame, rotation: rotation, maxDimension: 480) else { return }
    lock.lock()
    guard scanId == id, !lost else { lock.unlock(); return }
    latest = image
    let shouldDrain = active && !busy
    if shouldDrain { busy = true }
    lock.unlock()
    if shouldDrain { queue.async { self.drain(id) } }
  }

  func activate(_ id: String) {
    lock.lock()
    guard scanId == id, let reference, !lost else { lock.unlock(); return }
    active = true
    guard !busy else { lock.unlock(); return }
    busy = true
    lock.unlock()
    queue.async {
      do {
        try self.handler.perform([self.request], on: reference, orientation: .up)
        self.emit(id: id, matrix: matrix_identity_float3x3, confidence: 1, lost: false,
                  width: reference.width, height: reference.height)
        self.drain(id)
      } catch {
        self.recordFailure(id, error: error)
        self.finishDrain(id)
      }
    }
  }

  func cancel(_ id: String) {
    lock.lock()
    guard scanId == id else { lock.unlock(); return }
    scanId = nil
    reference = nil
    latest = nil
    active = false
    lost = false
    failures = 0
    lock.unlock()
    compositionScanLog("tracking cancelled id=\(id)")
  }

  func cancelCurrent() {
    lock.lock()
    let id = scanId
    lock.unlock()
    if let id { cancel(id) }
  }

  private func drain(_ id: String) {
    lock.lock()
    guard scanId == id, active, !lost, let image = latest else {
      if scanId == id { busy = false }
      lock.unlock()
      return
    }
    latest = nil
    lock.unlock()

    do {
      try handler.perform([request], on: image, orientation: .up)
      guard let observation = request.results?.first as? VNImageHomographicAlignmentObservation,
            observation.confidence >= 0.5 else {
        recordFailure(id, error: nil)
        finishDrain(id)
        return
      }
      let step = simd_inverse(observation.warpTransform)
      guard matrixIsFinite(step) else {
        recordFailure(id, error: nil)
        finishDrain(id)
        return
      }
      lock.lock()
      guard scanId == id, !lost else { lock.unlock(); return }
      cumulative = simd_mul(step, cumulative)
      let current = cumulative
      failures = 0
      let referenceSize = reference.map { ($0.width, $0.height) }
      lock.unlock()
      if let referenceSize {
        emit(id: id, matrix: current, confidence: Double(observation.confidence), lost: false,
             width: referenceSize.0, height: referenceSize.1)
      }
      queue.async { self.drain(id) }
    } catch {
      recordFailure(id, error: error)
      finishDrain(id)
    }
  }

  private func finishDrain(_ id: String) {
    lock.lock()
    guard scanId == id else { lock.unlock(); return }
    let continueDraining = scanId == id && active && !lost && latest != nil
    if !continueDraining { busy = false }
    lock.unlock()
    if continueDraining { queue.async { self.drain(id) } }
  }

  private func recordFailure(_ id: String, error: Error?) {
    lock.lock()
    guard scanId == id else { lock.unlock(); return }
    failures += 1
    let terminal = failures >= 2
    if terminal { lost = true; latest = nil; active = false }
    lock.unlock()
    compositionScanLog("tracking failure id=\(id) terminal=\(terminal) error=\(error?.localizedDescription ?? "low-confidence")")
    if terminal {
      DispatchQueue.main.async { [weak self] in
        self?.onUpdate?(["scanId": id, "matrix": [], "confidence": 0, "lost": true])
      }
    }
  }

  private func matrixIsFinite(_ matrix: simd_float3x3) -> Bool {
    (0..<3).allSatisfy { column in
      (0..<3).allSatisfy { row in matrix[column][row].isFinite }
    }
  }

  private func emit(id: String, matrix: simd_float3x3, confidence: Double, lost: Bool,
                    width: Int, height: Int) {
    guard width > 0, height > 0 else { return }
    let sourceScale = simd_float3x3(diagonal: SIMD3(Float(width), Float(height), 1))
    let destinationScale = simd_float3x3(diagonal: SIMD3(1 / Float(width), 1 / Float(height), 1))
    let normalized = simd_mul(destinationScale, simd_mul(matrix, sourceScale))
    guard matrixIsFinite(normalized) else { return }
    let values: [Double] = [
      Double(normalized[0][0]), Double(normalized[1][0]), Double(normalized[2][0]),
      Double(normalized[0][1]), Double(normalized[1][1]), Double(normalized[2][1]),
      Double(normalized[0][2]), Double(normalized[1][2]), Double(normalized[2][2]),
    ]
    DispatchQueue.main.async { [weak self] in
      self?.onUpdate?(["scanId": id, "matrix": values, "confidence": confidence, "lost": lost])
    }
  }
}

// The lock protects ownership; Vision and image work never execute under it.
// One slot is shared by Expo calls and the frame processor runtime.
final class CompositionScanSession {
  static let shared = CompositionScanSession()
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "komorebi.composition-scan", qos: .userInitiated)
  private var scanId: String?
  private var token: String?
  private var image: CGImage?
  private var imageRotation = 0
  private var copying = false
  private var analyzing = false
  private var cancelled = false
  private var requests: [VNRequest] = []

  func prepare(_ promise: Promise) {
    queue.async {
      do {
        warmUpCompositionVision()
        promise.resolve(try MiniCPMCompositionService.shared.prepare())
      } catch {
        compositionScanLog("model warmup failed error=\(error.localizedDescription)")
        promise.reject("ERR_SCAN_PREPARE", "Não foi possível preparar o scanner: \(error.localizedDescription)")
      }
    }
  }

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
    CompositionScanTracker.shared.cancel(id)
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
      compositionImage(from: frame, rotation: rotation, maxDimension: 640)
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
    if let trackingReference = resizedCompositionImage(reduced, maxDimension: 480) {
      CompositionScanTracker.shared.begin(id, reference: trackingReference)
    }
    compositionScanLog("frame captured id=\(id) token=\(imageToken.prefix(8)) size=\(reduced.width)x\(reduced.height) rotation=\(rotation)")
    return imageToken
  }

  func analyze(_ imageToken: String, id: String, recentAdvice: [[String: String]],
               frameAspectRatio: Double, subjectPoint: [String: Double]?,
               previewWidth: Double, previewHeight: Double, promise: Promise) {
    lock.lock()
    guard scanId == id, token == imageToken, !cancelled, !analyzing, let input = image else {
      lock.unlock()
      compositionScanLog("analyze rejected id=\(id) token=\(imageToken.prefix(8))")
      promise.reject("ERR_SCAN_IMAGE", "Scan image is no longer available")
      return
    }
    analyzing = true
    let rotation = imageRotation
    let analysisSubjectPoint = compositionAnalysisPoint(
      subjectPoint,
      imageWidth: input.width,
      imageHeight: input.height,
      rotation: rotation,
      previewWidth: previewWidth,
      previewHeight: previewHeight
    )
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
          let judgement = MiniCPMCompositionService.shared.analyze(
            input,
            recentAdvice: recentAdvice,
            frameAspectRatio: frameAspectRatio,
            subjectPoint: analysisSubjectPoint
          )
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
          CompositionScanTracker.shared.activate(id)
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
    if arguments?["tracking"] as? Bool == true {
      CompositionScanTracker.shared.offer(frame, id: id, rotation: rotation)
      return ""
    }
    return CompositionScanSession.shared.capture(frame, id: id, rotation: rotation) ?? ""
  }
}

public class CompositionScanModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CompositionScan")
    Events("onCompositionModelStatus", "onCompositionTrackingUpdate")
    OnCreate { [weak self] in
      ensureCompositionScanPluginLinked()
      compositionScanLog("module created status=\(MiniCPMCompositionService.shared.status()["state"] as? String ?? "unknown")")
      MiniCPMCompositionService.shared.onStatus = { [weak self] status in
        compositionScanLog("status event state=\(status["state"] as? String ?? "unknown") progress=\(status["progress"] ?? "none") error=\(status["error"] ?? "none")")
        self?.sendEvent("onCompositionModelStatus", status)
      }
      CompositionScanTracker.shared.onUpdate = { [weak self] update in
        self?.sendEvent("onCompositionTrackingUpdate", update)
      }
    }
    OnDestroy {
      CompositionScanSession.shared.cancelCurrent()
      CompositionScanTracker.shared.cancelCurrent()
      MiniCPMCompositionService.shared.onStatus = nil
      CompositionScanTracker.shared.onUpdate = nil
    }
    AsyncFunction("arm") { (id: String) -> Bool in
      CompositionScanSession.shared.arm(id)
    }
    AsyncFunction("prepare") { (promise: Promise) in
      CompositionScanSession.shared.prepare(promise)
    }
    AsyncFunction("analyze") { (token: String, id: String, context: CompositionAnalysisContextRecord, promise: Promise) in
      let recentAdvice = context.recentAdvice.map { ["topic": $0.topic, "message": $0.message] }
      let subjectPoint = context.subjectPoint.map { ["x": $0.x, "y": $0.y] }
      CompositionScanSession.shared.analyze(
        token,
        id: id,
        recentAdvice: recentAdvice,
        frameAspectRatio: context.frameAspectRatio,
        subjectPoint: subjectPoint,
        previewWidth: context.previewWidth,
        previewHeight: context.previewHeight,
        promise: promise
      )
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
    AsyncFunction("analyzePhoto") { (options: PhotoIntelligenceOptionsRecord, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard options.generateTags || options.generateFilename else {
            promise.resolve(PhotoIntelligenceResultRecord([
              "tags": [],
              "modelName": MiniCPMCompositionService.modelName,
            ]))
            return
          }
          let url: URL
          if options.imageUri.hasPrefix("file://"), let fileURL = URL(string: options.imageUri) {
            url = fileURL
          } else {
            url = URL(fileURLWithPath: options.imageUri)
          }
          let result = try MiniCPMCompositionService.shared.analyzePhoto(
            at: url,
            generateTags: options.generateTags,
            generateFilename: options.generateFilename
          )
          promise.resolve(PhotoIntelligenceResultRecord(result))
        } catch {
          compositionScanLog("photo intelligence failed error=\(error.localizedDescription)")
          promise.reject("ERR_PHOTO_INTELLIGENCE", error.localizedDescription)
        }
      }
    }
  }
}
