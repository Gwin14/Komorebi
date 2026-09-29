import AVFoundation
import CoreImage
import ImageIO
import os
import UniformTypeIdentifiers
import Vision

enum StackingStrategyID: String, CaseIterable {
  case bulb
  case motionBlur
  case doubleExposure
}

enum StackingPhase: String {
  case idle, preparing, capturing, awaitingSecondExposure, analyzing, compositing, exporting
  case completed, cancelled, failed
}

enum StackingError: Error, LocalizedError, Equatable {
  case busy
  case unsupportedStrategy
  case sessionNotReady
  case insufficientFrames
  case cancelled
  case missingImageData
  case cannotCreateOutput
  case cannotAddInput
  case cannotAddOutput

  var errorDescription: String? {
    switch self {
    case .busy: return "An image stacking capture is already running"
    case .unsupportedStrategy: return "The requested stacking strategy is not supported"
    case .sessionNotReady: return "The image stacking camera session is not ready"
    case .insufficientFrames: return "Not enough valid frames were captured"
    case .cancelled: return "Image stacking capture was cancelled"
    case .missingImageData: return "A captured frame did not contain image data"
    case .cannotCreateOutput: return "The stacked image could not be exported"
    case .cannotAddInput: return "Could not add the camera input"
    case .cannotAddOutput: return "Could not add a camera output"
    }
  }
}

struct StackingCapturePlan {
  let targetFrameCount: Int
  let minimumFrameCount: Int
  let maximumDuration: TimeInterval
  let frameSource: any FrameSource

  var usesVideoFrames: Bool { frameSource.kind == .pixelBufferStream }
}

enum FrameSourceKind {
  case fullResolutionPhotos
  case pixelBufferStream
}

protocol FrameSource {
  var kind: FrameSourceKind { get }
}

struct FullResolutionPhotoFrameSource: FrameSource {
  let kind: FrameSourceKind = .fullResolutionPhotos
}

struct PixelBufferStreamFrameSource: FrameSource {
  let kind: FrameSourceKind = .pixelBufferStream
  let maximumDimension: CGFloat
  let minimumFrameInterval: TimeInterval
}

struct StackingProgressSnapshot {
  var phase: StackingPhase = .idle
  var strategyID: StackingStrategyID?
  var capturedFrames = 0
  var acceptedFrames = 0
  var rejectedFrames = 0
  var elapsedSeconds: TimeInterval = 0
  var progress: Double = 0

  var dictionary: [String: Any] {
    [
      "state": phase.rawValue,
      "strategyId": strategyID?.rawValue ?? NSNull(),
      "capturedFrames": capturedFrames,
      "acceptedFrames": acceptedFrames,
      "rejectedFrames": rejectedFrames,
      "elapsedSeconds": elapsedSeconds,
      "progress": max(0, min(1, progress))
    ]
  }
}

struct StackingResult {
  let photoURL: URL
  let strategyID: StackingStrategyID
  let capturedFrames: Int
  let acceptedFrames: Int
  let rejectedFrames: Int
  let duration: TimeInterval
  let width: Int
  let height: Int
  let degraded: Bool

  var dictionary: [String: Any] {
    [
      "photoUri": photoURL.absoluteString,
      "strategyId": strategyID.rawValue,
      "capturedFrames": capturedFrames,
      "acceptedFrames": acceptedFrames,
      "rejectedFrames": rejectedFrames,
      "durationSeconds": duration,
      "width": width,
      "height": height,
      "degraded": degraded
    ]
  }
}

struct StoredFrame {
  let url: URL
  let metadata: [String: Any]
  let index: Int
}

final class FrameStore {
  let directory: URL
  private(set) var frames: [StoredFrame] = []

  init() throws {
    directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-stack-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
  }

  func append(data: Data, metadata: [String: Any]) throws -> StoredFrame {
    let frame = StoredFrame(
      url: directory.appendingPathComponent("frame-\(frames.count).heic"),
      metadata: metadata,
      index: frames.count
    )
    try data.write(to: frame.url, options: .atomic)
    frames.append(frame)
    return frame
  }

  func cleanup() {
    try? FileManager.default.removeItem(at: directory)
    frames.removeAll()
  }

  deinit { cleanup() }
}

struct FrameMetrics {
  let luminance: Double
  let sharpness: Double
}

final class FrameAnalyzer {
  private let context: CIContext

  init(context: CIContext) { self.context = context }

  func metrics(for image: CIImage) -> FrameMetrics {
    let proxy = image.oriented(.up).transformed(
      by: CGAffineTransform(scaleX: min(1, 512 / max(image.extent.width, 1)),
                            y: min(1, 512 / max(image.extent.height, 1)))
    )
    let luminance = areaAverage(of: proxy)
    let edges = proxy.applyingFilter("CIEdges", parameters: [kCIInputIntensityKey: 1.0])
    return FrameMetrics(luminance: luminance, sharpness: areaAverage(of: edges))
  }

  func motionScore(reference: CIImage, candidate: CIImage) -> Double {
    let common = reference.extent.intersection(candidate.extent)
    guard !common.isNull else { return 1 }
    let difference = candidate
      .cropped(to: common)
      .applyingFilter("CIDifferenceBlendMode", parameters: [
        kCIInputBackgroundImageKey: reference.cropped(to: common)
      ])
      .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0])
    return areaAverage(of: difference)
  }

  private func areaAverage(of image: CIImage) -> Double {
    guard !image.extent.isEmpty else { return 0 }
    let average = image.applyingFilter("CIAreaAverage", parameters: [
      kCIInputExtentKey: CIVector(cgRect: image.extent)
    ])
    var pixel = [UInt8](repeating: 0, count: 4)
    context.render(
      average,
      toBitmap: &pixel,
      rowBytes: 4,
      bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
      format: .RGBA8,
      colorSpace: CGColorSpaceCreateDeviceRGB()
    )
    return (0.2126 * Double(pixel[0]) + 0.7152 * Double(pixel[1]) + 0.0722 * Double(pixel[2])) / 255
  }
}

final class MotionAnalyzer {
  private let frameAnalyzer: FrameAnalyzer

  init(context: CIContext) {
    frameAnalyzer = FrameAnalyzer(context: context)
  }

  func score(reference: CIImage, candidate: CIImage) -> Double {
    frameAnalyzer.motionScore(reference: reference, candidate: candidate)
  }
}

final class FrameAligner {
  private let context: CIContext
  private let logger = Logger(subsystem: "dev.komorebi", category: "ImageStacking")

  init(context: CIContext) { self.context = context }

  func align(_ image: CIImage, to reference: CIImage) -> CIImage? {
    guard let referenceCG = proxyCGImage(reference), let imageCG = proxyCGImage(image) else {
      return nil
    }

    if let transform = homographicTransform(imageCG, referenceCG: referenceCG) {
      return applyHomography(
        transform,
        to: image,
        proxyScale: CGFloat(imageCG.width) / max(image.extent.width, 1)
      )
    }
    if let transform = translationTransform(imageCG, referenceCG: referenceCG) {
      logger.debug("Homographic registration failed; using translation fallback")
      let sx = image.extent.width / CGFloat(imageCG.width)
      let sy = image.extent.height / CGFloat(imageCG.height)
      return image.transformed(by: CGAffineTransform(
        translationX: transform.tx * sx,
        y: transform.ty * sy
      ))
    }
    logger.debug("Both homographic and translation registration failed; rejecting frame")
    return nil
  }

  private func proxyCGImage(_ image: CIImage) -> CGImage? {
    let scale = min(1, 640 / max(image.extent.width, image.extent.height))
    let proxy = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    return context.createCGImage(proxy, from: proxy.extent)
  }

  private func homographicTransform(_ image: CGImage, referenceCG: CGImage) -> simd_float3x3? {
    let request = VNHomographicImageRegistrationRequest(
      targetedCGImage: image,
      options: [:]
    )
    do {
      try VNImageRequestHandler(cgImage: referenceCG, options: [:]).perform([request])
      return request.results?.first?.warpTransform
    } catch {
      return nil
    }
  }

  private func translationTransform(_ image: CGImage, referenceCG: CGImage) -> CGAffineTransform? {
    let request = VNTranslationalImageRegistrationRequest(
      targetedCGImage: image,
      options: [:]
    )
    do {
      try VNImageRequestHandler(cgImage: referenceCG, options: [:]).perform([request])
      return request.results?.first?.alignmentTransform
    } catch {
      return nil
    }
  }

  private func applyHomography(
    _ matrix: simd_float3x3,
    to image: CIImage,
    proxyScale: CGFloat
  ) -> CIImage? {
    func project(_ point: CGPoint) -> CIVector? {
      let x = Float(point.x * proxyScale)
      let y = Float(point.y * proxyScale)
      let denominator = matrix.columns.0.z * x + matrix.columns.1.z * y + matrix.columns.2.z
      guard abs(denominator) > 0.0001 else { return nil }
      let px = (matrix.columns.0.x * x + matrix.columns.1.x * y + matrix.columns.2.x) / denominator
      let py = (matrix.columns.0.y * x + matrix.columns.1.y * y + matrix.columns.2.y) / denominator
      return CIVector(
        x: CGFloat(px) / proxyScale,
        y: CGFloat(py) / proxyScale
      )
    }

    let extent = image.extent
    guard
      let topLeft = project(CGPoint(x: extent.minX, y: extent.maxY)),
      let topRight = project(CGPoint(x: extent.maxX, y: extent.maxY)),
      let bottomLeft = project(CGPoint(x: extent.minX, y: extent.minY)),
      let bottomRight = project(CGPoint(x: extent.maxX, y: extent.minY))
    else { return nil }

    return image.applyingFilter("CIPerspectiveTransform", parameters: [
      "inputTopLeft": topLeft,
      "inputTopRight": topRight,
      "inputBottomLeft": bottomLeft,
      "inputBottomRight": bottomRight
    ])
  }
}

protocol StackingStrategy {
  var id: StackingStrategyID { get }
  func capturePlan(sceneLuminance: Double, options: [String: Any]) -> StackingCapturePlan
  func compose(
    frames: [StoredFrame],
    context: CIContext,
    options: [String: Any],
    progress: (Int, Int, Int) -> Void,
    isCancelled: () -> Bool
  ) throws -> (image: CIImage, accepted: Int, rejected: Int, reference: StoredFrame)
}

final class StackingStrategyRegistry {
  static let shared = StackingStrategyRegistry()
  private let strategies: [StackingStrategyID: any StackingStrategy]

  private init() {
    let values: [any StackingStrategy] = [
      BulbStrategy(),
      MotionBlurStrategy(),
      DoubleExposureStrategy()
    ]
    strategies = Dictionary(uniqueKeysWithValues: values.map { ($0.id, $0) })
  }

  func strategy(for id: StackingStrategyID) -> (any StackingStrategy)? {
    strategies[id]
  }
}

final class StackingExporter {
  private let context: CIContext

  init(context: CIContext) { self.context = context }

  func export(
    image: CIImage,
    referenceURL: URL?,
    outputFormat: String,
    strategyID: StackingStrategyID
  ) throws -> (URL, Int, Int) {
    let extent = image.extent.integral
    let displayColorSpace = CGColorSpace(name: CGColorSpace.sRGB)
      ?? CGColorSpaceCreateDeviceRGB()
    guard !extent.isEmpty,
          let cgImage = context.createCGImage(
            image,
            from: extent,
            format: .RGBA8,
            colorSpace: displayColorSpace
          )
    else { throw StackingError.cannotCreateOutput }

    let heif = outputFormat != "jpeg"
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "komorebi-\(strategyID.rawValue)-\(UUID().uuidString).\(heif ? "heic" : "jpg")"
    )
    guard let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      (heif ? UTType.heic : UTType.jpeg).identifier as CFString,
      1,
      nil
    ) else { throw StackingError.cannotCreateOutput }

    var properties: [CFString: Any] = [:]
    if let referenceURL,
       let source = CGImageSourceCreateWithURL(referenceURL as CFURL, nil),
       let sourceProperties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    {
      properties = sourceProperties
    }
    // As estratégias carregam o frame com `applyOrientationProperty`, portanto
    // os pixels exportados já estão na orientação final. Reutilizar a tag EXIF
    // original faria Photos aplicar a rotação uma segunda vez.
    properties[kCGImagePropertyOrientation] = 1
    properties[kCGImageDestinationLossyCompressionQuality] = 0.94
    CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      throw StackingError.cannotCreateOutput
    }
    return (url, cgImage.width, cgImage.height)
  }
}
